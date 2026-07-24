"use client";

import { useState } from "react";
import type { Person } from "@/lib/persons";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";

type Props = {
  persons: Person[];
  activeId: string | null;
  busy?: boolean;
  onSelect: (id: string) => void;
  onCreate: (name: string) => Promise<void>;
  onRename: (id: string, name: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
};

export default function PersonBar({
  persons,
  activeId,
  busy,
  onSelect,
  onCreate,
  onRename,
  onDelete,
}: Props) {
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [localBusy, setLocalBusy] = useState(false);
  const [error, setError] = useState<string>("");

  const active = persons.find((p) => p.id === activeId) ?? null;
  const canDelete = persons.length > 1 && !!activeId;

  async function wrap(fn: () => Promise<void>) {
    try {
      setError("");
      setLocalBusy(true);
      await fn();
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLocalBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <div className="text-sm text-zinc-300 mb-1">Person</div>
          <Select
            value={activeId ?? ""}
            disabled={busy || localBusy || persons.length === 0}
            onChange={(e) => onSelect(e.target.value)}
          >
            {persons.length === 0 ? (
              <option value="">Keine Person</option>
            ) : (
              persons.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.display_name}
                </option>
              ))
            )}
          </Select>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            disabled={busy || localBusy || !active}
            onClick={() => {
              setError("");
              setRenaming((v) => !v);
              setRenameValue(active?.display_name ?? "");
            }}
          >
            {renaming ? "Abbrechen" : "Umbenennen"}
          </Button>
          <Button
            type="button"
            variant="danger"
            disabled={busy || localBusy || !canDelete}
            onClick={() => {
              if (!activeId || !active) return;
              if (
                !confirm(
                  `Person „${active.display_name}“ inkl. Gewicht & Training löschen?`
                )
              ) {
                return;
              }
              void wrap(() => onDelete(activeId));
            }}
          >
            Löschen
          </Button>
        </div>
      </div>

      {renaming && active ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1">
            <div className="text-sm text-zinc-300 mb-1">Neuer Name</div>
            <Input
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              placeholder="Name"
            />
          </div>
          <Button
            type="button"
            variant="solid"
            disabled={busy || localBusy || !renameValue.trim()}
            onClick={() =>
              void wrap(async () => {
                await onRename(active.id, renameValue);
                setRenaming(false);
              })
            }
          >
            Speichern
          </Button>
        </div>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end border-t border-white/10 pt-3">
        <div className="flex-1">
          <div className="text-sm text-zinc-300 mb-1">Neue Person</div>
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="z.B. Partner"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (!newName.trim() || busy || localBusy) return;
                void wrap(async () => {
                  await onCreate(newName);
                  setNewName("");
                });
              }
            }}
          />
        </div>
        <Button
          type="button"
          variant="solid"
          disabled={busy || localBusy || !newName.trim()}
          onClick={() =>
            void wrap(async () => {
              await onCreate(newName);
              setNewName("");
            })
          }
        >
          {localBusy ? "…" : "Anlegen"}
        </Button>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-100">
          {error}
        </div>
      ) : null}
    </div>
  );
}
