// ============================================================
// SuggestIt - Mock Data Populators
// BACKEND SWAP: Replace seedAppData() with API calls.
// ============================================================

import type { User, Group, GroupMember, Suggestion, AlchemyResult } from "../types";

let _idCounter = 1;
export function generateId(prefix = "id"): string {
  return `${prefix}_${String(_idCounter++).padStart(4, "0")}`;
}

function randomFrom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

// ── Users ──────────────────────────────────────────────────

export function createMockUser(overrides: Partial<User> = {}): User {
  const names = [
    "Alex Morgan", "Jordan Lee", "Sam Rivera", "Casey Kim",
    "Riley Patel", "Morgan Chen", "Drew Santos", "Jamie Okafor",
  ];
  const name = overrides.name ?? randomFrom(names);
  const id = overrides.id ?? generateId("user");
  return {
    id,
    name,
    email: overrides.email ?? `${name.toLowerCase().replace(" ", ".")}@example.com`,
    avatarUrl: overrides.avatarUrl ?? `https://api.dicebear.com/7.x/avataaars/svg?seed=${id}`,
    createdAt: overrides.createdAt ?? daysAgo(Math.floor(Math.random() * 60) + 5),
  };
}

export function createMockUsers(count = 8): User[] {
  const fixedNames = [
    "Alex Morgan", "Jordan Lee", "Sam Rivera", "Casey Kim",
    "Riley Patel", "Morgan Chen", "Drew Santos", "Jamie Okafor",
  ];
  return fixedNames.slice(0, count).map((name, i) =>
    createMockUser({ name, id: `user_${String(i + 1).padStart(4, "0")}` })
  );
}

export const MOCK_CURRENT_USER: User = {
  id: "user_0001",
  name: "Alex Morgan",
  email: "alex.morgan@example.com",
  avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=user_0001",
  createdAt: daysAgo(30),
};

// ── Groups ─────────────────────────────────────────────────

const GROUP_SEEDS: Array<{ name: string; description: string }> = [
  {
    name: "Product Team",
    description: "Share ideas to improve our core product. All feedback welcome - big or small.",
  },
  {
    name: "Office Vibes",
    description: "Suggestions for making the office a better place to work.",
  },
  {
    name: "Tech Stack Debates",
    description: "Propose and vote on new tools, libraries, and architectural decisions.",
  },
  {
    name: "Design Critique",
    description: "Anonymous UX and visual design feedback for ongoing projects.",
  },
];


const SUGGESTION_SEEDS: Array<Array<{ title: string; description: string }>> = [
  // Group 0 - Product Team
  [
    { title: "Dark mode for the dashboard", description: "A lot of us work late. A proper dark mode would reduce eye strain and look great. Could use the OS preference as default." },
    { title: "Keyboard shortcut cheatsheet", description: "Add a modal (triggered by '?') that shows all available keyboard shortcuts. Discoverability is currently terrible." },
    { title: "Bulk export to CSV", description: "Power users need to export data regularly. Right now the only option is copy-pasting row by row." },
    { title: "Collapse sidebar by default on mobile", description: "On small screens the sidebar takes up too much space on first load. Should auto-collapse under 768px." },
    { title: "Add undo/redo for form edits", description: "Accidentally clearing a long text field is frustrating. Cmd+Z should work like everywhere else." },
  ],
  // Group 1 - Office Vibes
  [
    { title: "Standing desks in the main room", description: "Several people have mentioned back pain. Even a few height-adjustable desks would make a huge difference." },
    { title: "Better coffee machine", description: "The current machine makes terrible espresso. Something like a Breville would pay for itself in morale." },
    { title: "Plants everywhere", description: "Studies show plants reduce stress and improve air quality. Low-maintenance ones like pothos would be ideal." },
    { title: "Silent focus hours (10am-12pm)", description: "Reserve two hours each morning as no-meeting, no-loud-calls time. Post a shared calendar block." },
  ],
  // Group 2 - Tech Stack Debates
  [
    { title: "Migrate from CRA to Vite", description: "Create React App is effectively deprecated. Vite builds are 10-30x faster and the DX is much better." },
    { title: "Adopt Zod for runtime validation", description: "We have too many silent type mismatches at API boundaries. Zod + TypeScript inferred types would fix this." },
    { title: "Replace Redux with Zustand", description: "Our Redux store has grown unwieldy. Zustand is simpler, has less boilerplate, and performs better." },
    { title: "Add Storybook for UI components", description: "We keep rebuilding components that already exist because there's no catalogue. Storybook would prevent duplication." },
  ],
  // Group 3 - Design Critique
  [
    { title: "Increase base font size to 16px", description: "The current 14px body text is too small for extended reading. 16px is the web standard for good reason." },
    { title: "More consistent spacing scale", description: "We're using arbitrary pixel values everywhere. Switching to a 4px/8px grid would bring visual harmony." },
    { title: "Improve empty state illustrations", description: "Empty states currently show a generic grey box. Custom illustrations would make them more human and helpful." },
  ],
];

export function createMockGroup(
  members: User[],
  seed: (typeof GROUP_SEEDS)[0],
  ownerId: string,
  index: number
): Group {
  const id = `group_${String(index + 1).padStart(4, "0")}`;
  const groupMembers: GroupMember[] = members.map((u, i) => ({
    userId: u.id,
    groupId: id,
    role: u.id === ownerId ? "owner" : i === 1 ? "admin" : "member",
    joinedAt: daysAgo(Math.floor(Math.random() * 20) + 1),
    user: u,
  }));

  return {
    id,
    name: seed.name,
    description: seed.description,
    inviteCode: Math.random().toString(36).slice(2, 8).toUpperCase(),
    ownerId,
    createdAt: daysAgo(20 + index * 3),
    memberCount: members.length,
    suggestionCount: 0,
    members: groupMembers,
  };
}

export function createMockGroups(users: User[]): Group[] {
  return GROUP_SEEDS.map((seed, i) =>
    createMockGroup(
      users.slice(0, Math.floor(Math.random() * 4) + 3),
      seed,
      users[0].id,
      i
    )
  );
}

export function createMockSuggestions(
  groups: Group[],
  currentUserId: string
): Suggestion[] {
  const suggestions: Suggestion[] = [];

  groups.forEach((group, groupIndex) => {
    const seeds = SUGGESTION_SEEDS[groupIndex] ?? SUGGESTION_SEEDS[0];
    const memberIds = group.members.map((m) => m.userId);

    seeds.forEach((seed, i) => {
      const authorId = randomFrom(memberIds);
      const isOwn = authorId === currentUserId;
      const upvotes = Math.floor(Math.random() * 18) + 1;
      const downvotes = Math.floor(Math.random() * 5);
      const statuses: Suggestion["status"][] = [
        "open", "open", "open", "under_review", "accepted", "rejected",
      ];

      suggestions.push({
        id: generateId("sug"),
        groupId: group.id,
        authorId,
        title: seed.title,
        description: seed.description,
        status: statuses[i % statuses.length],
        upvotes,
        downvotes,
        currentUserVote: isOwn ? null : Math.random() > 0.6 ? "up" : null,
        createdAt: daysAgo(Math.floor(Math.random() * 14) + 1),
        updatedAt: daysAgo(Math.floor(Math.random() * 3)),
        isOwnSuggestion: isOwn,
      });
    });
  });

  return suggestions;
}

export function createMockAlchemyResults(
  suggestions: Suggestion[],
  groupId: string
): AlchemyResult[] {
  const groupSugs = suggestions.filter((s) => s.groupId === groupId);
  if (groupSugs.length < 2) return [];

  const result1: AlchemyResult = {
    id: generateId("alch"),
    groupId,
    title: `${groupSugs[0].title} + ${groupSugs[1].title}`,
    description: `A hybrid idea combining the core of "${groupSugs[0].title}" with the approach of "${groupSugs[1].title}". Consider piloting with one team first.`,
    sourceIds: [groupSugs[0].id, groupSugs[1].id],
    depth: 0,
    createdAt: daysAgo(2),
    upvotes: 5,
    downvotes: 1,
    currentUserVote: null,
  };

  if (groupSugs.length >= 3) {
    const result2: AlchemyResult = {
      id: generateId("alch"),
      groupId,
      title: `[Evolved] ${result1.title} x ${groupSugs[2].title}`,
      description: `Taking the combined concept further by layering in "${groupSugs[2].title}". This represents a more ambitious but cohesive vision.`,
      sourceIds: [result1.id, groupSugs[2].id],
      depth: 1,
      createdAt: daysAgo(1),
      upvotes: 3,
      downvotes: 0,
      currentUserVote: null,
    };
    return [result1, result2];
  }

  return [result1];
}

export interface SeedData {
  users: User[];
  currentUser: User;
  groups: Group[];
  suggestions: Suggestion[];
  alchemyResults: AlchemyResult[];
}

export function seedAppData(): SeedData {
  const users = createMockUsers(8);
  users[0] = MOCK_CURRENT_USER;

  const groups = createMockGroups(users);
  const suggestions = createMockSuggestions(groups, MOCK_CURRENT_USER.id);

  groups.forEach((g) => {
    g.suggestionCount = suggestions.filter((s) => s.groupId === g.id).length;
  });

  const alchemyResults = createMockAlchemyResults(suggestions, groups[0]?.id ?? "");

  return { users, currentUser: MOCK_CURRENT_USER, groups, suggestions, alchemyResults };
}
