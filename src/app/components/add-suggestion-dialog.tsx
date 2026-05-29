import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { validateSuggestion, type SuggestionFormData } from "../../utils/validation";

interface AddSuggestionDialogProps {
  open: boolean;
  onClose: () => void;
  onAdd: (title: string, description: string) => void;
}

export function AddSuggestionDialog({ open, onClose, onAdd }: AddSuggestionDialogProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [errors, setErrors] = useState<Partial<SuggestionFormData>>({});

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const data: SuggestionFormData = { title, description };
    const errs = validateSuggestion(data);
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    onAdd(title.trim(), description.trim());
    handleClose();
  };

  const handleClose = () => {
    setTitle(""); setDescription(""); setErrors({});
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className="max-w-md border"
        style={{ backgroundColor: "var(--app-bg-secondary)", borderColor: "var(--app-border-primary)" }}
      >
        <DialogHeader>
          <DialogTitle style={{ color: "var(--app-text-primary)" }}>Add New Suggestion</DialogTitle>
          <DialogDescription style={{ color: "var(--app-text-muted)" }}>
            Share an idea with the group.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-lg)" }}>
          <div>
            <div className="flex justify-between mb-1">
              <label className="text-sm font-medium" style={{ color: "var(--app-text-secondary)" }}>Title</label>
              <span className="text-xs" style={{ color: title.length >= 95 ? "#f87171" : "var(--app-text-muted)" }}>{title.length}/100</span>
            </div>
            <Input
              placeholder="Enter suggestion title (5–100 chars)"
              value={title}
              maxLength={100}
              onChange={(e) => { setTitle(e.target.value); setErrors((p) => ({ ...p, title: undefined })); }}
              style={{ backgroundColor: "var(--app-bg-tertiary)", borderColor: "var(--app-border-secondary)", color: "var(--app-text-primary)" }}
            />
            {errors.title && <p className="text-xs mt-1" style={{ color: "#f87171" }}>{errors.title}</p>}
          </div>
          <div>
            <div className="flex justify-between mb-1">
              <label className="text-sm font-medium" style={{ color: "var(--app-text-secondary)" }}>Description</label>
              <span className="text-xs" style={{ color: description.length >= 950 ? "#f87171" : "var(--app-text-muted)" }}>{description.length}/1000</span>
            </div>
            <Textarea
              placeholder="Describe your suggestion (10–1000 chars)"
              value={description}
              maxLength={1000}
              onChange={(e) => { setDescription(e.target.value); setErrors((p) => ({ ...p, description: undefined })); }}
              rows={4}
              style={{ backgroundColor: "var(--app-bg-tertiary)", borderColor: "var(--app-border-secondary)", color: "var(--app-text-primary)" }}
            />
            {errors.description && <p className="text-xs mt-1" style={{ color: "#f87171" }}>{errors.description}</p>}
          </div>
          <div className="flex" style={{ gap: "var(--spacing-sm)" }}>
            <Button
              type="button" variant="outline" onClick={handleClose} className="flex-1 border hover:opacity-90"
              style={{ backgroundColor: "var(--app-bg-tertiary)", borderColor: "var(--app-border-secondary)", color: "var(--app-text-primary)" }}
            >Cancel</Button>
            <Button
              type="submit" className="flex-1 hover:opacity-90"
              style={{ backgroundColor: "var(--app-purple-600)", color: "#fff" }}
            >Add Suggestion</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
