"use client";

import Navigation from "@/components/navbar";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Pencil, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useEffect, useState } from "react";
import { LoginForm } from "@/components/login-form";

type Admin = {
  id: string;
  email: string;
};

export default function AdminsPage() {
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [loading, setLoading] = useState(true);
  const [showLoginForm, setShowLoginForm] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [adminToRemove, setAdminToRemove] = useState<Admin | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  useEffect(() => {
    const loadAdmins = async () => {
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("profiles")
          .select("id, email")
          .eq("pending_deletion", false)
          .range(0, 5000);

        if (error) {
          setLoadError("Failed to load admins. Please try again.");
          return;
        }

        const rows = (data ?? [])
          .filter((row) => !!row.email)
          .map((row) => ({ id: row.id as string, email: row.email as string }));

        setAdmins(rows);
      } finally {
        setLoading(false);
      }
    };

    loadAdmins();
  }, []);

  const closeRemoveDialog = () => {
    if (isRemoving) return;
    setAdminToRemove(null);
    setRemoveError(null);
  };

  const handleRemove = async () => {
    if (!adminToRemove) return;

    setRemoveError(null);
    setIsRemoving(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("profiles")
        .update({ pending_deletion: true })
        .eq("id", adminToRemove.id)
        .select("id");

      if (error || !data || data.length === 0) {
        setRemoveError("Failed to remove admin. Check the update policy.");
        return;
      }

      setAdmins((prev) => prev.filter((a) => a.id !== adminToRemove.id));
      setAdminToRemove(null);
    } catch {
      setRemoveError("Failed to remove admin. Please try again.");
    } finally {
      setIsRemoving(false);
    }
  };

  return (
    <>
      <Navigation />
      <div className="px-16 py-8">
        <div className="max-w-xl justify-self-center w-full">
          <div className="flex mb-4 items-end justify-between">
            <div className="font-bold text-3xl">Admins</div>
            <Button
              onClick={() => setShowLoginForm((open) => !open)}
            >
              + Add
            </Button>
          </div>
          {showLoginForm ? (
            <div className="mb-6">
              <LoginForm defaultTab="signup" />
            </div>
          ) : null}
          {loadError && (
            <p className="text-sm text-destructive mb-2">{loadError}</p>
          )}
          <div className="overflow-hidden rounded-md border-2">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="px-4 py-2">Email</TableHead>
                  <TableHead className="px-4 py-2 w-12 text-right">
                    Edit
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={2} className="h-24 text-center">
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : admins.length ? (
                  admins.map((admin) => (
                    <TableRow key={admin.id}>
                      <TableCell className="px-4">{admin.email}</TableCell>
                      <TableCell className="px-2 text-right">
                        <Button
                          variant="link"
                          size="icon"
                          onClick={() => setAdminToRemove(admin)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={2} className="h-24 text-center">
                      No results.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>

      <Dialog
        open={adminToRemove !== null}
        onOpenChange={(open) => {
          if (!open) closeRemoveDialog();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove admin</DialogTitle>
            <DialogDescription>
              <span className="font-semibold text-foreground">
                {adminToRemove?.email}
              </span>{" "}
              will be flagged for deletion.
            </DialogDescription>
          </DialogHeader>
          {/* <p className="text-xl font-extrabold text-red-600">
            Their login still works until you delete them in Supabase.
          </p> */}
          {removeError && (
            <p className="text-sm text-destructive">{removeError}</p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={closeRemoveDialog}
              disabled={isRemoving}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleRemove}
              disabled={isRemoving}
            >
              {isRemoving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Remove from list"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}