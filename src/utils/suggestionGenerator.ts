/**
 * Suggestion Generator - Generates random suggestions for demo/visualization
 * Used to create live stats updates by adding suggestions every 3 seconds
 */

const SUGGESTION_IDEAS = [
  {
    title: "Add real-time notifications",
    description: "Users should get instant alerts when their suggestions get feedback.",
  },
  {
    title: "Implement suggestion templates",
    description: "Provide templates for common feedback types to improve consistency.",
  },
  {
    title: "Better mobile experience",
    description: "The app needs optimization for tablets and small screens.",
  },
  {
    title: "Export suggestion lists",
    description: "Allow users to download their suggestions as PDF or CSV.",
  },
  {
    title: "Suggestion filtering by date",
    description: "Add date range filters to find recent suggestions quickly.",
  },
  {
    title: "Team collaboration features",
    description: "Enable multiple people to work on suggestions together.",
  },
  {
    title: "Analytics dashboard",
    description: "Show trends in suggestion types and voting patterns over time.",
  },
  {
    title: "Spam detection",
    description: "Automatically flag and filter out duplicate or spam suggestions.",
  },
  {
    title: "Suggestion archiving",
    description: "Archive old suggestions to keep the feed clean and focused.",
  },
  {
    title: "Customizable voting system",
    description: "Allow admins to choose between upvotes, scales, or emoji reactions.",
  },
  {
    title: "API for third-party integrations",
    description: "Build APIs so other tools can sync with SuggestIt.",
  },
  {
    title: "Dark theme implementation",
    description: "Create a dark mode for better accessibility and night usage.",
  },
  {
    title: "Bulk action support",
    description: "Select multiple suggestions to move, delete, or status in bulk.",
  },
  {
    title: "Advanced search",
    description: "Full-text search across suggestion titles and descriptions.",
  },
  {
    title: "Commenting system",
    description: "Add threaded comments to allow discussion on each suggestion.",
  },
];

export function generateRandomSuggestion() {
  const idea = SUGGESTION_IDEAS[Math.floor(Math.random() * SUGGESTION_IDEAS.length)];
  
  // Randomize status: 60% open/ongoing, 25% accepted, 15% rejected
  const rand = Math.random();
  let status: "open" | "under_review" | "accepted" | "rejected";
  
  if (rand < 0.15) {
    status = "rejected";
  } else if (rand < 0.4) {
    status = "accepted";
  } else if (rand < 0.7) {
    status = "open";
  } else {
    status = "under_review";
  }
  
  return {
    title: idea.title,
    description: idea.description,
    status,
  };
}

/**
 * Start a background worker that creates random suggestions every 3 seconds
 * for the specified group
 * @param groupId - The group to add suggestions to
 * @param createSuggestionFn - The createSuggestion function from context
 * @param setSuggestionStatusFn - The setSuggestionStatus function from context
 * @param authorId - The user creating the suggestion
 * @returns A cleanup function to stop the worker
 */
export function startSuggestionWorker(
  groupId: string,
  createSuggestionFn: (groupId: string, data: any) => any,
  setSuggestionStatusFn: (id: string, status: "open" | "under_review" | "accepted" | "rejected") => void,
  authorId: string
): () => void {
  const intervalId = setInterval(() => {
    const { title, description, status } = generateRandomSuggestion();
    const suggestion = createSuggestionFn(groupId, { title, description });
    
    // If status is not "open" (the default), update it
    if (status !== "open") {
      setSuggestionStatusFn(suggestion.id, status);
    }
  }, 3000); // Every 3 seconds

  // Return cleanup function
  return () => clearInterval(intervalId);
}
