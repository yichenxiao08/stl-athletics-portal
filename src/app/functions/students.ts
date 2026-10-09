import { createClient } from "@/lib/supabase/client";
import { Student } from "../students/columns";
import { DEFAULT_SCHOOL_YEAR, SchoolYear } from "@/lib/constants";

export type StudentSpreadsheetRow = {
  firstName: string;
  lastName: string;
  grade?: number;
  gender: string;
  email: string;
};

const getSchoolYearStart = (schoolYear: string) => {
  const match = /^(\d{4})-\d{2}$/.exec(schoolYear);
  if (!match) {
    throw new Error(`Invalid school year: ${schoolYear}`);
  }
  return Number(match[1]);
};

export const isStudentActiveForSchoolYear = (
  grad: number,
  schoolYear: string
) => {
  // A student who graduated in the starting calendar year is already gone
  // when that school year begins. For example, grad 2026 is inactive in 2026-27.
  return Number.isFinite(grad) && grad > getSchoolYearStart(schoolYear);
};

const normalizeName = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const nameVariants = (name: string) => {
  const normalized = normalizeName(name);
  const variants = new Set([normalized]);
  const commaParts = name.split(",").map((part) => normalizeName(part));

  if (commaParts.length === 2 && commaParts[0] && commaParts[1]) {
    variants.add(`${commaParts[1]} ${commaParts[0]}`.trim());
  } else {
    const parts = normalized.split(" ").filter(Boolean);
    if (parts.length > 1) {
      variants.add(`${parts.slice(1).join(" ")} ${parts[0]}`);
    }
  }

  return variants;
};

const parseGraduationYear = (email: string) => {
  const localPart = email.split("@")[0] ?? "";
  // The optional trailing digits distinguish students with the same name and
  // graduation year, e.g. first.last281 means grad year 2028, student 1.
  const match = /(\d{4}|\d{2})(?:\d+)?$/.exec(localPart);
  if (!match) return undefined;

  const parsedYear = Number(match[1]);
  const year = match[1].length === 2 ? 2000 + parsedYear : parsedYear;
  return year >= 2000 && year <= 2100 ? year : undefined;
};

const fallbackGraduationYear = (grade: number, schoolYear: SchoolYear) =>
  getSchoolYearStart(schoolYear) + 1 + (12 - grade);

const gradeForSchoolYear = (grad: number, schoolYear: SchoolYear) =>
  getSchoolYearStart(schoolYear) + 1 + 12 - grad;

const getStudentGraduationYear = (email: string, storedGrad: number) =>
  parseGraduationYear(email) ?? storedGrad;

export const importStudents = async (
  rows: StudentSpreadsheetRow[],
  schoolYear: SchoolYear
) => {
  if (rows.length === 0) {
    throw new Error("The spreadsheet does not contain any student rows.");
  }

  const supabase = createClient();
  const { data: existingStudents, error: existingStudentsError } = await supabase
    .from("students")
    .select("id, name, email, grade, gender, grad, active, point_offset");

  if (existingStudentsError) {
    throw new Error(existingStudentsError.message);
  }

  const importedKeys = new Set<string>();
  const matchedStudentIds = new Set<number>();
  const updates: {
    id: number;
    values: { grade?: number; gender?: string; active?: boolean };
  }[] = [];
  const inserts: {
    name: string;
    email: string;
    grade: number;
    gender: string;
    grad: number;
    active: boolean;
    point_offset: number;
  }[] = [];
  let updatedCount = 0;

  const updateStudent = async (
    id: number,
    values: { grade?: number; gender?: string; active?: boolean }
  ) => {
    const { error } = await supabase.from("students").update(values).eq("id", id);
    if (error) {
      throw new Error(error.message);
    }
  };

  for (const row of rows) {
    const name = `${row.lastName}, ${row.firstName}`;
    const email = row.email.trim().toLowerCase();
    const parsedGraduationYear = parseGraduationYear(email);
    const calculatedGrade =
      parsedGraduationYear === undefined
        ? undefined
        : gradeForSchoolYear(parsedGraduationYear, schoolYear);
    const usableParsedGraduationYear =
      parsedGraduationYear !== undefined &&
      calculatedGrade !== undefined &&
      calculatedGrade >= 9 &&
      calculatedGrade <= 12
        ? parsedGraduationYear
        : undefined;
    const importedGrade =
      row.grade ??
      (usableParsedGraduationYear === undefined
        ? undefined
        : calculatedGrade);

    const importedName = normalizeName(name);
    const importedKey = `${email}|${importedName}`;

    if (importedKeys.has(importedKey)) {
      throw new Error(`The spreadsheet contains a duplicate student: ${name} (${email}).`);
    }
    importedKeys.add(importedKey);

    const existingStudent = (existingStudents ?? []).find(
      (student) =>
        student.email.trim().toLowerCase() === email &&
        [...nameVariants(student.name)].some((variant) =>
          nameVariants(name).has(variant)
        )
    );

    if (existingStudent) {
      matchedStudentIds.add(existingStudent.id);
      const active = isStudentActiveForSchoolYear(
        getStudentGraduationYear(existingStudent.email, existingStudent.grad),
        schoolYear
      );
      const values: { grade?: number; gender?: string; active?: boolean } = {
        gender: row.gender,
        active,
      };
      if (importedGrade !== undefined) {
        values.grade = importedGrade;
      }
      if (
        (importedGrade !== undefined && existingStudent.grade !== importedGrade) ||
        existingStudent.gender !== row.gender ||
        existingStudent.active !== active
      ) {
        updates.push({
          id: existingStudent.id,
          values,
        });
        updatedCount += 1;
      }
      continue;
    }

    const grade = importedGrade ?? 9;
    const grad =
      usableParsedGraduationYear ?? fallbackGraduationYear(grade, schoolYear);

    inserts.push({
      name,
      email,
      grade,
      gender: row.gender,
      grad,
      active: isStudentActiveForSchoolYear(grad, schoolYear),
      point_offset: 0,
    });
  }

  // Reconcile active for students not present in this upload as well.
  for (const student of existingStudents ?? []) {
    const active = isStudentActiveForSchoolYear(
      getStudentGraduationYear(student.email, student.grad),
      schoolYear
    );
    if (
      !matchedStudentIds.has(student.id) &&
      student.active !== active
    ) {
      updates.push({ id: student.id, values: { active } });
      updatedCount += 1;
    }
  }

  if (updates.length > 0) {
    await Promise.all(
      updates.map(({ id, values }) => updateStudent(id, values))
    );
  }

  if (inserts.length > 0) {
    const { error: insertError } = await supabase
      .from("students")
      .insert(inserts);
    if (insertError) {
      throw new Error(insertError.message);
    }
  }

  return {
    inserted: inserts.length,
    updated: updatedCount,
  };
};

export const selectData = async () => {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("student_points")
    .select()
    .range(0, 5000);
  if (!error) {
    // Sort by last name and format names as "Last, First"
    const sortedData = (data as Student[])
      .map((student) => {
        let firstName = "";
        let lastName = "";

        // Check if name is already in "Last, First" format
        if (student.name.includes(",")) {
          const parts = student.name.split(",").map((part) => part.trim());
          lastName = parts[0] || "";
          firstName = parts[1] || "";
        } else {
          // Names are stored as "Last Name First Name" - find the last space to split
          const trimmedName = student.name.trim();
          const lastSpaceIndex = trimmedName.indexOf(" ");

          if (lastSpaceIndex !== -1) {
            lastName = trimmedName.substring(0, lastSpaceIndex);
            firstName = trimmedName.substring(lastSpaceIndex + 1);
          } else {
            // Single name case - treat as first name
            firstName = trimmedName;
            lastName = "";
          }
        }

        return {
          ...student,
          name: lastName ? `${lastName}, ${firstName}` : firstName,
          // Store original name parts for sorting
          _firstName: firstName,
          _lastName: lastName,
        };
      })
      .sort((a, b) => {
        // Sort by last name, then by first name
        const lastNameCompare = a._lastName.localeCompare(b._lastName);
        if (lastNameCompare !== 0) return lastNameCompare;
        return a._firstName.localeCompare(b._firstName);
      })
      .map(({ _lastName, _firstName, ...student }) => student); // Remove temp sorting fields

    return sortedData as Student[];
  }
};
export const addPlayer = async ({ name, email, grade }: Student) => {
  const supabase = createClient();
  const grad =
    parseGraduationYear(email) ??
    fallbackGraduationYear(grade, DEFAULT_SCHOOL_YEAR);
  const { data, error } = await supabase
    .from("students")
    .insert({
      name,
      email,
      grade,
      grad,
      active: isStudentActiveForSchoolYear(grad, DEFAULT_SCHOOL_YEAR),
      point_offset: 0,
    })
    .select();
  if (!error) {
    return data as Student[];
  }
};
export const deletePlayer = async (playerId: number) => {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("players")
    .delete()
    .eq("id", playerId)
    .select();
  if (!error) {
    return data as Student[];
  }
};

export const updatePlayer = async ({ id, name, email, grade }: Student) => {
  const supabase = createClient();
  const grad =
    parseGraduationYear(email) ??
    fallbackGraduationYear(grade, DEFAULT_SCHOOL_YEAR);
  const { data, error } = await supabase
    .from("players")
    .update({
      name,
      email,
      grade,
      grad,
      active: isStudentActiveForSchoolYear(grad, DEFAULT_SCHOOL_YEAR),
    })
    .eq("id", id)
    .select();
  if (!error) {
    return data as Student[];
  }
};
