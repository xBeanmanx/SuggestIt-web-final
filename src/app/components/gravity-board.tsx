import { useState } from "react";
import { Sparkles, X, Plus, RefreshCw, LayoutGrid, Grid3x3 } from "lucide-react";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { Textarea } from "./ui/textarea";
import { Checkbox } from "./ui/checkbox";

interface IdeaSeed {
  id: string;
  title: string;
  author: string;
  isCombined: boolean;
  combinedFrom?: string[]; // IDs of ideas that were combined
}

interface GravityBoardProps {
  onSwitchToGridView?: () => void;
}

const mockIdeas: IdeaSeed[] = [
  {
    id: "1",
    title: "Team lunch every Friday",
    author: "László",
    isCombined: false,
  },
  {
    id: "2",
    title: "Better search functionality",
    author: "Bean",
    isCombined: false,
  },
  {
    id: "3",
    title: "Mobile app version",
    author: "John",
    isCombined: false,
  },
  {
    id: "4",
    title: "Themed team lunches with search feature integration",
    author: "László + Bean",
    isCombined: true,
    combinedFrom: ["1", "2"],
  },
];

export function GravityBoard({ onSwitchToGridView }: GravityBoardProps) {
  const [ideas, setIdeas] = useState<IdeaSeed[]>(mockIdeas);
  const [showFuseDialog, setShowFuseDialog] = useState(false);
  const [selectedIdeas, setSelectedIdeas] = useState<string[]>([]);
  const [refinementText, setRefinementText] = useState("");
  const [newIdea, setNewIdea] = useState<IdeaSeed | null>(null);
  const [isGridView, setIsGridView] = useState(false);

  const handleOpenFuseDialog = () => {
    setShowFuseDialog(true);
    setSelectedIdeas([]);
    setRefinementText("");
    setNewIdea(null);
  };

  const toggleIdeaSelection = (id: string) => {
    setSelectedIdeas((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleCreateFusion = () => {
    if (selectedIdeas.length === 0) return;

    const selectedIdeasData = ideas.filter((i) => selectedIdeas.includes(i.id));
    const authors = [...new Set(selectedIdeasData.map((i) => i.author))].join(" + ");
    
    // Auto-generate title by appending all selected idea titles
    const generatedTitle = selectedIdeasData.map((i) => i.title).join(" + ");

    const newFusedIdea: IdeaSeed = {
      id: `fused_${Date.now()}`,
      title: generatedTitle,
      author: authors,
      isCombined: true,
      combinedFrom: selectedIdeas,
    };

    setNewIdea(newFusedIdea);
  };

  const handleAddIdea = () => {
    if (newIdea) {
      setIdeas((prev) => [...prev, newIdea]);
      setShowFuseDialog(false);
      setSelectedIdeas([]);
      setRefinementText("");
      setNewIdea(null);
    }
  };

  const handleRegenerate = () => {
    setNewIdea(null);
    setRefinementText("");
  };

  const handleAbandon = () => {
    setShowFuseDialog(false);
    setSelectedIdeas([]);
    setRefinementText("");
    setNewIdea(null);
  };

  return (
    <div className="h-full flex flex-col" style={{ backgroundColor: 'var(--app-bg-primary)' }}>
      {/* Header */}
      <div 
        className="border-b" 
        style={{ 
          padding: 'var(--spacing-2xl) var(--spacing-3xl)',
          background: 'linear-gradient(to right, var(--app-bg-secondary), var(--app-purple-900), var(--app-bg-secondary))',
          borderColor: 'var(--app-border-primary)'
        }}
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center mb-1" style={{ gap: 'var(--spacing-md)' }}>
              <Sparkles style={{ width: 'var(--icon-lg)', height: 'var(--icon-lg)', color: 'var(--app-purple-400)' }} />
              <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--app-text-primary)' }}>Idea Alchemy</h2>
            </div>
            <p style={{ fontSize: '0.875rem', color: 'var(--app-text-secondary)' }}>
              Transform and combine ideas into powerful solutions
            </p>
          </div>
          <div className="flex items-center" style={{ gap: 'var(--spacing-md)' }}>
            <Button
              onClick={handleOpenFuseDialog}
              style={{ 
                backgroundColor: 'var(--app-purple-600)',
                color: 'var(--app-text-primary)'
              }}
              className="hover:opacity-90"
            >
              <Plus style={{ width: 'var(--icon-sm)', height: 'var(--icon-sm)', marginRight: 'var(--spacing-sm)' }} />
              Add Idea
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto" style={{ padding: 'var(--spacing-2xl)' }}>
        <div className="max-w-4xl mx-auto">
          {/* Switch to Grid View Button */}
          {onSwitchToGridView && (
            <div style={{ marginBottom: 'var(--spacing-lg)' }}>
              <Button
                variant="outline"
                onClick={onSwitchToGridView}
                className="w-full hover:opacity-90"
                style={{
                  backgroundColor: 'var(--app-bg-tertiary)',
                  borderColor: 'var(--app-border-secondary)',
                  color: 'var(--app-text-primary)'
                }}
              >
                <Grid3x3 style={{ width: 'var(--icon-sm)', height: 'var(--icon-sm)', marginRight: 'var(--spacing-sm)' }} />
                Switch to Grid View
              </Button>
            </div>
          )}
          
          {/* Ideas List */}
          <div className={isGridView ? "grid grid-cols-1 md:grid-cols-2" : ""} style={{ gap: isGridView ? 'var(--spacing-md)' : 'var(--spacing-md)' }}>
            {ideas.map((idea, index) => (
              <div
                key={idea.id}
                className="border transition-colors"
                style={{
                  backgroundColor: 'var(--app-bg-secondary)',
                  borderColor: 'var(--app-border-primary)',
                  borderRadius: 'var(--radius-lg)',
                  padding: 'var(--spacing-lg)',
                  marginBottom: isGridView ? 0 : (index < ideas.length - 1 ? 'var(--spacing-md)' : 0)
                }}
                onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--app-purple-500)'}
                onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--app-border-primary)'}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center mb-2" style={{ gap: 'var(--spacing-sm)' }}>
                      {idea.isCombined ? (
                        <span style={{ color: 'var(--app-purple-400)', fontSize: '1.25rem' }}>⚡</span>
                      ) : (
                        <span style={{ color: 'var(--app-text-muted)', fontSize: '1.25rem' }}>🌱</span>
                      )}
                      <h3 style={{ color: 'var(--app-text-primary)', fontWeight: '600' }}>{idea.title}</h3>
                    </div>
                    <div style={{ fontSize: '0.875rem', color: 'var(--app-text-muted)' }}>
                      by {idea.author}
                      {idea.isCombined && (
                        <span 
                          className="ml-2 rounded" 
                          style={{
                            padding: 'var(--spacing-xs) var(--spacing-sm)',
                            backgroundColor: 'var(--app-purple-900)',
                            color: 'var(--app-purple-300)',
                            fontSize: '0.75rem'
                          }}
                        >
                          Combined
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Fuse Dialog */}
      <Dialog open={showFuseDialog} onOpenChange={setShowFuseDialog}>
        <DialogContent 
          className="max-w-2xl max-h-[80vh] overflow-y-auto border"
          style={{
            backgroundColor: 'var(--app-bg-secondary)',
            borderColor: 'var(--app-border-primary)'
          }}
        >
          <DialogHeader>
            <div className="flex items-center justify-between pr-8">
              <DialogTitle className="flex items-center" style={{ fontSize: '1.25rem', color: 'var(--app-text-primary)', gap: 'var(--spacing-sm)' }}>
                <Sparkles style={{ width: 'var(--icon-md)', height: 'var(--icon-md)', color: 'var(--app-purple-400)' }} />
                Fuse Ideas
              </DialogTitle>
            </div>
            <DialogDescription style={{ color: 'var(--app-text-muted)' }}>
              Select multiple ideas to combine them into a single, more powerful concept
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-2xl)' }}>
            {/* Idea Selection */}
            <div>
              <h3 style={{ fontSize: '0.875rem', fontWeight: '600', color: 'var(--app-text-secondary)', marginBottom: 'var(--spacing-md)' }}>
                Select ideas to combine:
              </h3>
              <div className="max-h-60 overflow-y-auto" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}>
                {ideas.map((idea) => (
                  <div
                    key={idea.id}
                    className="flex items-start cursor-pointer transition-colors rounded-lg"
                    style={{
                      gap: 'var(--spacing-md)',
                      padding: 'var(--spacing-md)',
                      backgroundColor: 'var(--app-bg-tertiary)'
                    }}
                    onClick={() => toggleIdeaSelection(idea.id)}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--app-bg-hover)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--app-bg-tertiary)'}
                  >
                    <Checkbox
                      checked={selectedIdeas.includes(idea.id)}
                      onCheckedChange={() => toggleIdeaSelection(idea.id)}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <div className="flex items-center" style={{ gap: 'var(--spacing-sm)' }}>
                        {idea.isCombined ? (
                          <span style={{ color: 'var(--app-purple-400)' }}>⚡</span>
                        ) : (
                          <span style={{ color: 'var(--app-text-muted)' }}>🌱</span>
                        )}
                        <p style={{ color: 'var(--app-text-primary)', fontWeight: '500', fontSize: '0.875rem' }}>{idea.title}</p>
                      </div>
                      <p style={{ fontSize: '0.75rem', color: 'var(--app-text-muted)', marginTop: 'var(--spacing-xs)' }}>by {idea.author}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* New Idea Preview or Creation */}
            {!newIdea ? (
              <div>
                <h3 style={{ fontSize: '0.875rem', fontWeight: '600', color: 'var(--app-text-secondary)', marginBottom: 'var(--spacing-md)' }}>
                  Refinement instructions (optional - for AI processing):
                </h3>
                <Textarea
                  value={refinementText}
                  onChange={(e) => setRefinementText(e.target.value)}
                  placeholder="Add any refinement instructions for the AI to process later (e.g., 'Make it more specific', 'Focus on budget constraints')..."
                  className="min-h-32 border"
                  style={{
                    backgroundColor: 'var(--app-bg-tertiary)',
                    borderColor: 'var(--app-border-secondary)',
                    color: 'var(--app-text-primary)'
                  }}
                />
                <div className="mt-4 flex justify-end">
                  <Button
                    onClick={handleCreateFusion}
                    disabled={selectedIdeas.length === 0}
                    className="hover:opacity-90"
                    style={{
                      backgroundColor: 'var(--app-purple-600)',
                      color: 'var(--app-text-primary)'
                    }}
                  >
                    Create Fusion
                  </Button>
                </div>
              </div>
            ) : (
              <div>
                <h3 style={{ fontSize: '0.875rem', fontWeight: '600', color: 'var(--app-text-secondary)', marginBottom: 'var(--spacing-md)' }}>
                  Preview of combined idea:
                </h3>
                <div 
                  className="border-2 rounded-lg"
                  style={{
                    backgroundColor: 'var(--app-bg-tertiary)',
                    borderColor: 'var(--app-purple-500)',
                    padding: 'var(--spacing-lg)'
                  }}
                >
                  <div className="flex items-start mb-2" style={{ gap: 'var(--spacing-sm)' }}>
                    <span style={{ color: 'var(--app-purple-400)', fontSize: '1.25rem' }}>⚡</span>
                    <div className="flex-1">
                      <h4 style={{ color: 'var(--app-text-primary)', fontWeight: '600', fontSize: '1.125rem' }}>{newIdea.title}</h4>
                      <p style={{ fontSize: '0.875rem', color: 'var(--app-text-muted)', marginTop: 'var(--spacing-xs)' }}>by {newIdea.author}</p>
                      <div style={{ marginTop: 'var(--spacing-sm)' }}>
                        <span 
                          className="rounded"
                          style={{
                            padding: 'var(--spacing-xs) var(--spacing-sm)',
                            backgroundColor: 'var(--app-purple-900)',
                            color: 'var(--app-purple-300)',
                            fontSize: '0.75rem'
                          }}
                        >
                          Combined from {selectedIdeas.length} idea{selectedIdeas.length > 1 ? "s" : ""}
                        </span>
                      </div>
                      {refinementText && (
                        <div 
                          className="rounded border"
                          style={{
                            marginTop: 'var(--spacing-md)',
                            padding: 'var(--spacing-sm)',
                            backgroundColor: 'var(--app-bg-secondary)',
                            borderColor: 'var(--app-border-secondary)'
                          }}
                        >
                          <p style={{ fontSize: '0.75rem', color: 'var(--app-text-muted)', marginBottom: 'var(--spacing-xs)' }}>AI Refinement Instructions:</p>
                          <p style={{ fontSize: '0.875rem', color: 'var(--app-text-secondary)' }}>{refinementText}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="mt-6 flex" style={{ gap: 'var(--spacing-md)' }}>
                  <Button
                    onClick={handleAddIdea}
                    className="flex-1 hover:opacity-90"
                    style={{
                      backgroundColor: 'var(--app-purple-600)',
                      color: 'var(--app-text-primary)'
                    }}
                  >
                    <Plus style={{ width: 'var(--icon-sm)', height: 'var(--icon-sm)', marginRight: 'var(--spacing-sm)' }} />
                    Add Idea
                  </Button>
                  <Button
                    onClick={handleRegenerate}
                    variant="outline"
                    className="flex-1 hover:opacity-90"
                    style={{
                      backgroundColor: 'var(--app-bg-tertiary)',
                      borderColor: 'var(--app-border-secondary)',
                      color: 'var(--app-text-secondary)'
                    }}
                  >
                    <RefreshCw style={{ width: 'var(--icon-sm)', height: 'var(--icon-sm)', marginRight: 'var(--spacing-sm)' }} />
                    Regenerate
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
