"use client";
import Navigation from "@/components/navbar";
import * as z from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as XLSX from "xlsx";
import {
  addPlayer,
  importStudents,
  isStudentActiveForSchoolYear,
  selectData,
} from "@/app/functions/students";
import type { StudentSpreadsheetRow } from "@/app/functions/students";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Student, createColumns } from "./columns";
import { DataTable } from "./data-table";
import { ChangeEvent, useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Filter, Plus, Loader2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useSchoolYear } from "@/lib/school-year-context";

const formSchema = z.object({
  name: z.string().min(1, "Name must be at least 1 character."),
  email: z
    .email("Enter a valid email address.")
    .min(1, "Enter a valid email address."),
  grade: z
    .int("Grade must be a number.")
    .min(9, "Grade must be at least 9.")
    .max(12, "Grade must be at most 12."),
});

const normalizeHeader = (header: string) =>
  header.trim().toLowerCase().replace(/\s+/g, " ");

const spreadsheetLayouts = [
  {
    headers: ["first name", "last name", "grade", "gender", "email"],
    firstName: "first name",
    lastName: "last name",
    grade: "grade",
    preferredName: undefined,
    gender: "gender",
    email: "email",
  },
  {
    headers: ["given name", "usual name", "surname", "gender", "gafeuser"],
    firstName: "given name",
    preferredName: "usual name",
    lastName: "surname",
    grade: undefined,
    gender: "gender",
    email: "gafeuser",
  },
];

const validNamePattern = /^[\p{L}][\p{L} .'-]*$/u;

const parseStudentSpreadsheet = async (
  file: File
): Promise<StudentSpreadsheetRow[]> => {
  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    throw new Error("Only .xlsx files are accepted.");
  }

  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error("The spreadsheet does not contain a worksheet.");
  }

  const worksheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
    defval: "",
    raw: false,
  });
  if (rows.length === 0) {
    throw new Error("The spreadsheet does not contain any student rows.");
  }

  const rawHeaders = Object.keys(rows[0]);
  const normalizedHeaders = rawHeaders.map(normalizeHeader);
  const duplicateHeaders = normalizedHeaders.filter(
    (header, index) => normalizedHeaders.indexOf(header) !== index
  );
  if (duplicateHeaders.length > 0) {
    throw new Error(
      `Duplicate columns are not allowed: ${[...new Set(duplicateHeaders)].join(", ")}.`
    );
  }
  const layout = spreadsheetLayouts.find(
    (candidate) =>
      candidate.headers.length === normalizedHeaders.length &&
      candidate.headers.every((header) => normalizedHeaders.includes(header))
  );
  if (!layout) {
    throw new Error(
      "The spreadsheet columns are invalid. Use either First Name, Last Name, Grade, Gender, Email or Given name, Usual name, Surname, Gender, GAFEUser."
    );
  }

  const headers = new Map(
    rawHeaders.map((header) => [normalizeHeader(header), header])
  );

  const getCell = (row: Record<string, unknown>, header: string) =>
    String(row[headers.get(header) ?? ""] ?? "").trim();

  return rows.map((row, index) => {
    const firstName = getCell(row, layout.firstName);
    const preferredName = layout.preferredName
      ? getCell(row, layout.preferredName)
      : "";
    const lastName = getCell(row, layout.lastName);
    const email = getCell(row, layout.email);
    const gender = getCell(row, layout.gender);
    const gradeText = layout.grade ? getCell(row, layout.grade) : "";
    const parsedGrade = gradeText ? Number(gradeText) : undefined;

    if (!firstName || !lastName || !gender || !email) {
      throw new Error(`Row ${index + 2} is missing a required value.`);
    }
    if (
      !validNamePattern.test(firstName) ||
      (preferredName && !validNamePattern.test(preferredName)) ||
      !validNamePattern.test(lastName)
    ) {
      throw new Error(`Row ${index + 2} has an invalid first or last name.`);
    }
    if (layout.grade) {
      if (
        parsedGrade === undefined ||
        !Number.isInteger(parsedGrade) ||
        parsedGrade < 9 ||
        parsedGrade > 12
      ) {
        throw new Error(`Row ${index + 2} has an invalid grade: ${gradeText}.`);
      }
    }
    if (!/^(male|female)$/i.test(gender)) {
      throw new Error(
        `Row ${index + 2} has an invalid gender: ${gender}. Use Male or Female.`
      );
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error(`Row ${index + 2} has an invalid email: ${email}.`);
    }

    return {
      firstName: preferredName || firstName,
      lastName,
      grade: parsedGrade,
      gender,
      email,
    };
  });
};

export default function Students() {
  const { selectedYear } = useSchoolYear();
  const [data, setData] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isAddByManualOpen, setIsAddByManualOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState("");
  const [selectedSpreadsheetFile, setSelectedSpreadsheetFile] =
    useState<File | null>(null);
  const spreadsheetInputRef = useRef<HTMLInputElement>(null);
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      email: "",
      grade: undefined,
    },
  });

  useEffect(() => {
    const loadData = async () => {
      try {
        const result = await selectData();
        if (result) {
          setData(result);
        } else {
          setData([]);
        }
      } catch (error) {
        setData([]);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);
  const [filter, setFilter] = useState<string>("");
  const [gradeFilters, setGradeFilters] = useState({
    nine: false,
    ten: false,
    eleven: false,
    twelve: false,
  });
  const [includeGraduated, setIncludeGraduated] = useState(false);

  const handleGradeFilterChange = (
    grade: keyof typeof gradeFilters,
    checked: boolean
  ) => {
    setGradeFilters((prev) => ({
      ...prev,
      [grade]: checked,
    }));
  };
  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    setAddError(null);
    setIsAdding(true);
    try {
      await addPlayer({
        name: values.name,
        email: values.email,
        grade: values.grade,
      } as Student);
      const result = await selectData();
      if (result) {
        setData(result);
      }

      setIsAddByManualOpen(false);
      form.reset();
    } catch (error) {
      setAddError("Failed to add student. Please try again.");
    } finally {
      setIsAdding(false);
    }
  };
  const handleSpreadsheetSelection = (
    event: ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) {
      setSelectedFileName("");
      setSelectedSpreadsheetFile(null);
      return;
    }

    setSelectedFileName(file.name);
    setSelectedSpreadsheetFile(file);
    setImportError(null);
    setImportSuccess(null);
  };

  const handleSpreadsheetUpload = async () => {
    const file = selectedSpreadsheetFile;
    if (!file) return;

    setImportError(null);
    setImportSuccess(null);
    setIsImporting(true);
    try {
      const rows = await parseStudentSpreadsheet(file);
      const result = await importStudents(rows, selectedYear);
      const refreshedStudents = await selectData();
      if (refreshedStudents) {
        setData(refreshedStudents);
      }
      setImportSuccess(
        `Imported ${rows.length} rows: ${result.inserted} added and ${result.updated} updated.`
      );
      window.setTimeout(() => setIsImportOpen(false), 1500);
    } catch (error) {
      setImportError(
        error instanceof Error
          ? error.message
          : "Failed to import the student spreadsheet."
      );
    } finally {
      setIsImporting(false);
      if (spreadsheetInputRef.current) {
        spreadsheetInputRef.current.value = "";
      }
      setSelectedFileName("");
      setSelectedSpreadsheetFile(null);
    }
  };
  const clearFilters = () => {
    setGradeFilters({
      nine: false,
      ten: false,
      eleven: false,
      twelve: false,
    });
    setIncludeGraduated(false);
    setFilter("");
  };

  const filteredData = data.filter((student) => {
    // Filter by name - check both "Last, First" and "First Last" formats
    const filterLower = filter.toLowerCase();
    const nameLower = student.name.toLowerCase();
    
    // Check original format (e.g., "Doe, John")
    const originalMatch = nameLower.includes(filterLower);
    const noComma = nameLower.replace(",", "").includes(filterLower);
    // Check reversed format (e.g., "John Doe" when name is stored as "Doe, John")
    const nameParts = nameLower.split(", ");
    const reversedName = nameParts.length === 2 ? `${nameParts[1]} ${nameParts[0]}` : nameLower;
    const reversedMatch = reversedName.includes(filterLower);
    
    const nameMatch = originalMatch || reversedMatch || noComma;
    
    // Filter by grade if any grade filters are selected
    const selectedGrades: number[] = Object.entries(gradeFilters)
      .filter(([_, isSelected]) => isSelected)
      .map(([grade, _]) => {
        switch (grade) {
          case "nine":
            return 9;
          case "ten":
            return 10;
          case "eleven":
            return 11;
          case "twelve":
            return 12;
          default:
            return 0;
        }
      });

    const gradeMatch =
      selectedGrades.length === 0 || selectedGrades.includes(student.grade);

    // Filter by graduation status (active students vs graduated)
    const graduationMatch =
      includeGraduated ||
      isStudentActiveForSchoolYear(student.grad, selectedYear);

    return nameMatch && gradeMatch && graduationMatch;
  });
  const columns = createColumns({
    onEdit: (student) => {
    },
    onDelete: (student) => {
    },
  });
  return (
    <>
      <Navigation />

      <div className="px-16 py-8">
        <div className="text-3xl font-bold mb-4">Student List</div>
        <div className="flex gap-4 items-center mb-2">
          <Input
            placeholder="Filter by name"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="secondary" size="icon">
                <Filter />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 mr-4">
              <div className="flex flex-col gap-2">
                <div className="font-semibold">Filter by grade</div>
                <div className="flex flex-wrap gap-2">
                  <div className="flex gap-2">
                    <Checkbox
                      id="nine"
                      checked={gradeFilters.nine}
                      onCheckedChange={(checked) =>
                        handleGradeFilterChange("nine", checked as boolean)
                      }
                    />
                    <Label className="flex items-center gap-2" htmlFor="nine">
                      9th Grade
                    </Label>
                  </div>
                  <div className="flex gap-2">
                    <Checkbox
                      id="ten"
                      checked={gradeFilters.ten}
                      onCheckedChange={(checked) =>
                        handleGradeFilterChange("ten", checked as boolean)
                      }
                    />
                    <Label className="flex items-center gap-2" htmlFor="ten">
                      10th Grade
                    </Label>
                  </div>
                  <div className="flex gap-2">
                    <Checkbox
                      id="eleven"
                      checked={gradeFilters.eleven}
                      onCheckedChange={(checked) =>
                        handleGradeFilterChange("eleven", checked as boolean)
                      }
                    />
                    <Label className="flex items-center gap-2" htmlFor="eleven">
                      11th Grade
                    </Label>
                  </div>
                  <div className="flex gap-2">
                    <Checkbox
                      id="twelve"
                      checked={gradeFilters.twelve}
                      onCheckedChange={(checked) =>
                        handleGradeFilterChange("twelve", checked as boolean)
                      }
                    />
                    <Label className="flex items-center gap-2" htmlFor="twelve">
                      12th Grade
                    </Label>
                  </div>
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Label className="text-md font-semibold" htmlFor="all">
                      Include graduated students?
                    </Label>
                    <Checkbox
                      id="all"
                      checked={includeGraduated}
                      onCheckedChange={(checked) =>
                        setIncludeGraduated(checked as boolean)
                      }
                    />
                  </div>
                </div>
                <Button variant="secondary" size="sm" onClick={clearFilters}>
                  Clear Filters
                </Button>
              </div>
            </PopoverContent>
          </Popover>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button>
                <Plus />
                Add Students
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="">
              <DropdownMenuItem onClick={() => setIsImportOpen(true)}>
                Upload XLSX
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setIsAddByManualOpen(true)}>
                Add by Manual Entry
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <Dialog
          open={isImportOpen}
          onOpenChange={(open) => {
            setIsImportOpen(open);
            if (!open) {
              setImportError(null);
              setImportSuccess(null);
              setSelectedFileName("");
              setSelectedSpreadsheetFile(null);
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Upload student spreadsheet</DialogTitle>
              <DialogDescription>
                Upload an .xlsx file with one of these column layouts in the
                first worksheet:
                <br />
                First Name, Last Name, Grade, Gender, Email
                <br />
                or
                <br />
                Given name, Usual name, Surname, Gender, GAFEUser.
              </DialogDescription>
            </DialogHeader>
            <div>
              <Input
                id="student-spreadsheet-upload"
                ref={spreadsheetInputRef}
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={handleSpreadsheetSelection}
                disabled={isImporting}
                className="sr-only"
              />
              <label
                htmlFor="student-spreadsheet-upload"
                className={`flex h-9 w-full items-center rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors ${
                  isImporting
                    ? "cursor-not-allowed opacity-50"
                    : "cursor-pointer hover:bg-accent"
                }`}
              >
                <span className="font-medium">Choose file </span>
                <span
                  className={`ml-2 truncate ${
                    selectedFileName
                      ? "text-foreground"
                      : "text-muted-foreground/60"
                  }`}
                >
                  {selectedFileName || "No file selected"}
                </span>
              </label>
            </div>
            {selectedSpreadsheetFile && (
              <div className="flex justify-start">
                <Button
                  type="button"
                  onClick={handleSpreadsheetUpload}
                  disabled={isImporting}
                >
                  {isImporting ? "Uploading..." : "Confirm upload"}
                </Button>
              </div>
            )}
            <p className="text-sm text-muted-foreground">
              Importing for school year {selectedYear}. Existing students are
              matched by name and email; their grade and gender are updated.
            </p>
            {isImporting && (
              <p className="text-sm text-muted-foreground">Importing...</p>
            )}
            {importError && (
              <p className="text-sm text-destructive">{importError}</p>
            )}
            {importSuccess && (
              <p className="text-sm text-green-600">{importSuccess}</p>
            )}
          </DialogContent>
        </Dialog>
        <Dialog open={isAddByManualOpen} onOpenChange={setIsAddByManualOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add by Manual Entry</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form
                className="space-y-4"
                onSubmit={form.handleSubmit(onSubmit)}
              >
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="John Doe" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="johndoe@example.com" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="grade"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Grade</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          placeholder="10"
                          value={field.value ?? ""}
                          onChange={(e) => {
                            const num = e.target.valueAsNumber;
                            field.onChange(Number.isNaN(num) ? undefined : num);
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      form.reset({ grade: undefined });
                      setIsAddByManualOpen(false);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isAdding}>
                    {isAdding ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "Add"
                    )}
                  </Button>
                </div>
                {addError && (
                  <p className="text-sm text-destructive">{addError}</p>
                )}
              </form>
            </Form>
          </DialogContent>
        </Dialog>
        <DataTable columns={columns} data={filteredData} isLoading={loading} />
      </div>
    </>
  );
}
