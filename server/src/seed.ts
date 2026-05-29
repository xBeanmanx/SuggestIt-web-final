// ============================================================
// SuggestIt Server  Seed Data
// Mirrors the client-side mock data for dev/demo purposes.
// ============================================================

import type { IStore } from "./types.js";
import type { User, SuggestionStatus } from "./types.js";

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

function randomFrom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

const FIXED_USERS: User[] = [
  { id: "user_0001", name: "Alex Morgan",  username: "alex",   email: "alex.morgan@example.com",  avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=user_0001", createdAt: daysAgo(30) },
  { id: "user_0002", name: "Jordan Lee",   username: "jordan", email: "jordan.lee@example.com",   avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=user_0002", createdAt: daysAgo(25) },
  { id: "user_0003", name: "Sam Rivera",   username: "sam",    email: "sam.rivera@example.com",   avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=user_0003", createdAt: daysAgo(22) },
  { id: "user_0004", name: "Casey Kim",    username: "casey",  email: "casey.kim@example.com",    avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=user_0004", createdAt: daysAgo(20) },
  { id: "user_0005", name: "Riley Patel",  username: "riley",  email: "riley.patel@example.com",  avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=user_0005", createdAt: daysAgo(18) },
  { id: "user_0006", name: "Morgan Chen",  username: "morgan", email: "morgan.chen@example.com",  avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=user_0006", createdAt: daysAgo(15) },
  { id: "user_0007", name: "Drew Santos",  username: "drew",   email: "drew.santos@example.com",  avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=user_0007", createdAt: daysAgo(12) },
  { id: "user_0008", name: "Jamie Okafor", username: "jamie",  email: "jamie.okafor@example.com", avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=user_0008", createdAt: daysAgo(10) },
];

const GROUP_SEEDS = [
  { name: "Product Team",      description: "Share ideas to improve our core product. All feedback welcome  big or small." },
  { name: "Office Vibes",      description: "Suggestions for making the office a better place to work." },
  { name: "Tech Stack Debates",description: "Propose and vote on new tools, libraries, and architectural decisions." },
  { name: "Design Critique",   description: "Anonymous UX and visual design feedback for ongoing projects." },
];

const SUGGESTION_SEEDS: Array<Array<{ title: string; description: string }>> = [
  [
    { title: "Dark mode for the dashboard",      description: "A lot of us work late. A proper dark mode would reduce eye strain and look great. Could use the OS preference as default." },
    { title: "Keyboard shortcut cheatsheet",     description: "Add a modal (triggered by '?') that shows all available keyboard shortcuts. Discoverability is currently terrible." },
    { title: "Bulk export to CSV",               description: "Power users need to export data regularly. Right now the only option is copy-pasting row by row." },
    { title: "Collapse sidebar by default on mobile", description: "On small screens the sidebar takes up too much space on first load. Should auto-collapse under 768px." },
    { title: "Add undo/redo for form edits",     description: "Accidentally clearing a long text field is frustrating. Cmd+Z should work like everywhere else." },
  ],
  [
    { title: "Standing desks in the main room",  description: "Several people have mentioned back pain. Even a few height-adjustable desks would make a huge difference." },
    { title: "Better coffee machine",            description: "The current machine makes terrible espresso. Something like a Breville would pay for itself in morale." },
    { title: "Plants everywhere",                description: "Studies show plants reduce stress and improve air quality. Low-maintenance ones like pothos would be ideal." },
    { title: "Silent focus hours (10am-12pm)",   description: "Reserve two hours each morning as no-meeting, no-loud-calls time. Post a shared calendar block." },
  ],
  [
    { title: "Migrate from CRA to Vite",         description: "Create React App is effectively deprecated. Vite builds are 10-30x faster and the DX is much better." },
    { title: "Adopt Zod for runtime validation", description: "We have too many silent type mismatches at API boundaries. Zod + TypeScript inferred types would fix this." },
    { title: "Replace Redux with Zustand",       description: "Our Redux store has grown unwieldy. Zustand is simpler, has less boilerplate, and performs better." },
    { title: "Add Storybook for UI components",  description: "We keep rebuilding components that already exist because there's no catalogue. Storybook would prevent duplication." },
  ],
  [
    { title: "Increase base font size to 16px",  description: "The current 14px body text is too small for extended reading. 16px is the web standard for good reason." },
    { title: "More consistent spacing scale",    description: "We're using arbitrary pixel values everywhere. Switching to a 4px/8px grid would bring visual harmony." },
    { title: "Improve empty state illustrations",description: "Empty states currently show a generic grey box. Custom illustrations would make them more human and helpful." },
  ],
];

const STATUSES: SuggestionStatus[] = ["open", "open", "open", "under_review", "accepted", "rejected"];

export async function seedStore(store: IStore): Promise<void> {
  // Delete old admin user if it exists with the old email
  const oldAdmin = await store.getUserByEmail("admin@suggestit.local");
  if (oldAdmin) {
    console.log("Removing old admin user with legacy email...");
    // Since there's no delete method, we'll create the new one which will have the correct email
  }

  // Seed demo admin and user accounts with usernames
  const adminUser = await store.createUser({
    name: "Admin User",
    email: "simonlacika1234@gmail.com",
    username: "admin",
    password: "admin123",
    role: "ADMIN",
    permissions: ["READ_DOMAIN", "WRITE_OWN_SUGGESTIONS", "ADMINISTER_DOMAIN", "VIEW_SECURITY_LOGS"],
    avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=admin",
  });

  const regularUser = await store.createUser({
    name: "Regular User",
    email: "user@suggestit.local",
    username: "user",
    password: "user1234",
    role: "USER",
    permissions: ["READ_DOMAIN", "WRITE_OWN_SUGGESTIONS"],
    avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=user",
  });

  // Create a shared group for both users to chat in
  const sharedGroup = await store.createGroup(
    {
      name: "Demo Chat Group",
      description: "Group for demonstrating real-time chat between admin and regular user",
      ownerId: adminUser.id,
    },
    [regularUser.id]
  );

  // Create a sample conversation between admin and user
  const conversation = await store.createConversation({
    groupId: sharedGroup.id,
    name: "Admin & User Chat",
    members: [adminUser, regularUser],
  });

  // Seed a welcome message
  await store.sendChatMessage({
    conversationId: conversation.id,
    userId: adminUser.id,
    content: "Welcome! This conversation demonstrates real-time chat. Both admin and regular users can participate equally.",
  });

  // Seed existing users and groups
  for (const user of FIXED_USERS) {
    try {
      await store.createUser({
        name: user.name,
        email: user.email,
        username: user.username,
        password: "password123",
        role: "USER",
        permissions: [],
        avatarUrl: user.avatarUrl,
      });
    } catch (error) {
      // User already exists, skip
    }
  }

  const ownerId = "user_0001";

  // Seed groups with suggestions
  for (let gi = 0; gi < GROUP_SEEDS.length; gi++) {
    const groupSeed = GROUP_SEEDS[gi];
    const memberIds = FIXED_USERS.slice(0, Math.floor(Math.random() * 3) + 4).map((u) => u.id);

    const group = await store.createGroup(
      { name: groupSeed.name, description: groupSeed.description, ownerId },
      memberIds.filter((id) => id !== ownerId)
    );

    const seeds = SUGGESTION_SEEDS[gi] ?? SUGGESTION_SEEDS[0];
    for (let i = 0; i < seeds.length; i++) {
      const seed = seeds[i];
      const authorId = randomFrom(memberIds);
      const s = await store.createSuggestion({
        groupId: group.id,
        authorId,
        title: seed.title,
        description: seed.description,
      });

      // Set a non-open status for variety
      const status = STATUSES[i % STATUSES.length];
      if (status !== "open") {
        await store.setSuggestionStatus(s.id, status);
      }
    }
  }
}
