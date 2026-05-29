// group-detail-dialog.tsx
import { useState } from "react";
import { Users, Plus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { useAppState } from "../../context/AppStateContext";
import { validateSuggestion, type SuggestionFormData } from "../../utils/validation";
import { SuggestionCard } from "./suggestion-card";
import type { Group, Suggestion } from "../../types";

// ── Inline Add Suggestion form ───────────────────────────

function AddSuggestionForm({ groupId, onDone }: { groupId: string; onDone: () => void }) {
  const { createSuggestion } = useAppState();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [errors, setErrors] = useState<Partial<SuggestionFormData>>({});

  const handleSubmit = () => {
    const data: SuggestionFormData = { title, description };
    const errs = validateSuggestion(data);
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    createSuggestion(groupId, data);
    onDone();
  };

  return (
    <div
      className="rounded-lg p-4 border mb-4"
      style={{ backgroundColor: "var(--app-bg-primary)", borderColor: "var(--app-border-secondary)" }}
    >
      <h4 className="text-sm font-semibold mb-3" style={{ color: "var(--app-text-primary)" }}>
        New Suggestion
      </h4>
      <div className="space-y-3">
        <div>
          <div className="flex justify-between mb-1">
            <span className="text-xs" style={{ color: "var(--app-text-muted)" }}>Title</span>
            <span className="text-xs" style={{ color: title.length >= 95 ? "#f87171" : "var(--app-text-muted)" }}>
              {title.length}/100
            </span>
          </div>
          <Input
            placeholder="Title (5–100 characters)"
            value={title}
            maxLength={100}
            onChange={(e) => { setTitle(e.target.value); setErrors((p) => ({ ...p, title: undefined })); }}
            style={{ backgroundColor: "var(--app-bg-secondary)", borderColor: "var(--app-border-secondary)", color: "var(--app-text-primary)" }}
          />
          {errors.title && <p className="text-xs mt-1" style={{ color: "#f87171" }}>{errors.title}</p>}
        </div>
        <div>
          <div className="flex justify-between mb-1">
            <span className="text-xs" style={{ color: "var(--app-text-muted)" }}>Description</span>
            <span className="text-xs" style={{ color: description.length >= 950 ? "#f87171" : "var(--app-text-muted)" }}>
              {description.length}/1000
            </span>
          </div>
          <Textarea
            placeholder="Describe your suggestion… (10–1000 characters)"
            value={description}
            maxLength={1000}
            onChange={(e) => { setDescription(e.target.value); setErrors((p) => ({ ...p, description: undefined })); }}
            rows={3}
            style={{ backgroundColor: "var(--app-bg-secondary)", borderColor: "var(--app-border-secondary)", color: "var(--app-text-primary)" }}
          />
          {errors.description && <p className="text-xs mt-1" style={{ color: "#f87171" }}>{errors.description}</p>}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline" size="sm" onClick={onDone} className="flex-1"
            style={{ borderColor: "var(--app-border-secondary)", color: "var(--app-text-muted)" }}
          >
            Cancel
          </Button>
          <Button
            size="sm" onClick={handleSubmit} className="flex-1"
            style={{ backgroundColor: "var(--app-purple-600)", color: "#fff" }}
          >
            Submit
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Inline Edit Suggestion form ──────────────────────────

function EditSuggestionForm({ suggestion, onDone }: { suggestion: Suggestion; onDone: () => void }) {
  const { updateSuggestion } = useAppState();
  const [title, setTitle] = useState(suggestion.title);
  const [description, setDescription] = useState(suggestion.description);
  const [errors, setErrors] = useState<Partial<SuggestionFormData>>({});

  const handleSubmit = () => {
    const data: SuggestionFormData = { title, description };
    const errs = validateSuggestion(data);
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    updateSuggestion(suggestion.id, data);
    onDone();
  };

  return (
    <div
      className="rounded-lg p-4 border mb-2"
      style={{ backgroundColor: "var(--app-bg-primary)", borderColor: "var(--app-border-secondary)" }}
    >
      <div className="space-y-3">
        <div>
          <div className="flex justify-between mb-1">
            <span className="text-xs" style={{ color: "var(--app-text-muted)" }}>Title</span>
            <span className="text-xs" style={{ color: title.length >= 95 ? "#f87171" : "var(--app-text-muted)" }}>
              {title.length}/100
            </span>
          </div>
          <Input
            value={title} maxLength={100}
            onChange={(e) => { setTitle(e.target.value); setErrors((p) => ({ ...p, title: undefined })); }}
            style={{ backgroundColor: "var(--app-bg-secondary)", borderColor: "var(--app-border-secondary)", color: "var(--app-text-primary)" }}
          />
          {errors.title && <p className="text-xs mt-1" style={{ color: "#f87171" }}>{errors.title}</p>}
        </div>
        <div>
          <div className="flex justify-between mb-1">
            <span className="text-xs" style={{ color: "var(--app-text-muted)" }}>Description</span>
            <span className="text-xs" style={{ color: description.length >= 950 ? "#f87171" : "var(--app-text-muted)" }}>
              {description.length}/1000
            </span>
          </div>
          <Textarea
            value={description} maxLength={1000}
            onChange={(e) => { setDescription(e.target.value); setErrors((p) => ({ ...p, description: undefined })); }}
            rows={3}
            style={{ backgroundColor: "var(--app-bg-secondary)", borderColor: "var(--app-border-secondary)", color: "var(--app-text-primary)" }}
          />
          {errors.description && <p className="text-xs mt-1" style={{ color: "#f87171" }}>{errors.description}</p>}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline" size="sm" onClick={onDone} className="flex-1"
            style={{ borderColor: "var(--app-border-secondary)", color: "var(--app-text-muted)" }}
          >
            Cancel
          </Button>
          <Button
            size="sm" onClick={handleSubmit} className="flex-1"
            style={{ backgroundColor: "var(--app-purple-600)", color: "#fff" }}
          >
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Suggestion row with edit inline ─────────────────────

function SuggestionRow({ suggestion, totalMembers }: { suggestion: Suggestion; totalMembers: number }) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return <EditSuggestionForm suggestion={suggestion} onDone={() => setEditing(false)} />;
  }

  return (
    <div className="space-y-2">
      <SuggestionCard
        suggestion={suggestion}
        totalMembers={totalMembers}
        onEdit={() => setEditing(true)}
      />
    </div>
  );
}

// ── Main dialog ───────────────────────────────────────────

interface GroupDetailDialogProps {
  group: Group;
  open: boolean;
  onClose: () => void;
}

export function GroupDetailDialog({ group, open, onClose }: GroupDetailDialogProps) {
  const { getSuggestionsForGroup } = useAppState();
  const [showAddForm, setShowAddForm] = useState(false);

  const suggestions = getSuggestionsForGroup(group.id);
  const accepted = suggestions.filter((s) => s.status === "accepted");
  const pending = suggestions.filter((s) => s.status !== "accepted");

  // Derive 2-letter initials for the group avatar
  const groupInitials = group.name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent
        className="max-w-2xl max-h-[80vh] overflow-y-auto p-0 border"
        style={{ backgroundColor: "var(--app-bg-secondary)", borderColor: "var(--app-border-primary)" }}
      >
        <DialogHeader className="p-6 pb-4">
          <div className="flex items-start justify-between">
            <div>
              
              <div className="flex items-center gap-3 mb-1">
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                  style={{
                    backgroundColor: "var(--app-purple-900)",
                    color: "var(--app-purple-300)",
                    border: "1px solid var(--app-border-primary)",
                  }}
                >
                  {groupInitials}
                </div>
                <DialogTitle className="text-xl" style={{ color: "var(--app-text-primary)" }}>
                  {group.name}
                </DialogTitle>
              </div>
              <DialogDescription className="mt-1" style={{ color: "var(--app-text-muted)" }}>
                {group.description}
              </DialogDescription>
              <div className="flex items-center gap-3 mt-2">
                <span className="flex items-center gap-1 text-xs" style={{ color: "var(--app-text-muted)" }}>
                  <Users className="w-3 h-3" />
                  {group.memberCount} member{group.memberCount !== 1 ? "s" : ""}
                </span>
                <span
                  className="text-xs font-mono px-2 py-0.5 rounded"
                  style={{ backgroundColor: "var(--app-bg-tertiary)", color: "var(--app-text-muted)" }}
                >
                  Code: {group.inviteCode}
                </span>
              </div>
            </div>
            <Button
              size="sm"
              onClick={() => setShowAddForm((p) => !p)}
              style={{ backgroundColor: "var(--app-purple-600)", color: "#fff", flexShrink: 0 }}
            >
              <Plus className="w-4 h-4 mr-1" />
              Add Idea
            </Button>
          </div>
        </DialogHeader>

        <div className="px-6 pb-6">
          {showAddForm && (
            <AddSuggestionForm groupId={group.id} onDone={() => setShowAddForm(false)} />
          )}

          {/* Accepted */}
          {accepted.length > 0 && (
            <div className="mb-6">
              <h3
                className="font-semibold mb-3 text-sm"
                style={{ color: "var(--app-purple-400)" }}
              >
                Accepted Suggestions
              </h3>
              <div className="space-y-4">
                {accepted.map((s) => (
                  <SuggestionRow key={s.id} suggestion={s} totalMembers={group.memberCount} />
                ))}
              </div>
            </div>
          )}

          {/* Pending */}
          <div>
            <h3
              className="font-semibold mb-3 text-sm"
              style={{ color: "var(--app-text-muted)" }}
            >
              Suggestions ({pending.length})
            </h3>
            {pending.length === 0 && accepted.length === 0 ? (
              <p className="text-center py-10 text-sm" style={{ color: "var(--app-text-muted)" }}>
                No suggestions yet. Be the first!
              </p>
            ) : pending.length === 0 ? null : (
              <div className="space-y-4">
                {pending.map((s) => (
                  <SuggestionRow key={s.id} suggestion={s} totalMembers={group.memberCount} />
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
