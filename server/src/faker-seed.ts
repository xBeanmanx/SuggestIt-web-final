import { faker } from "@faker-js/faker";
import { createStore } from "./store-factory.js";

const userCount = Number(process.env.FAKER_USERS ?? 250);
const groupCount = Number(process.env.FAKER_GROUPS ?? 50);
const suggestionsPerGroup = Number(process.env.FAKER_SUGGESTIONS_PER_GROUP ?? 25);

async function main() {
  const store = await createStore();
  const users = [];

  for (let i = 0; i < userCount; i++) {
    const email = faker.internet.email().toLowerCase();
    users.push(await store.createUser({
      username: `${faker.internet.username().toLowerCase()}_${i}`,
      email,
      name: faker.person.fullName(),
      password: "password123",
      role: i === 0 ? "ADMIN" : "USER",
      permissions: [],
      avatarUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(email)}`,
    }));
  }

  for (let i = 0; i < groupCount; i++) {
    const owner = faker.helpers.arrayElement(users);
    const members = faker.helpers.arrayElements(users, { min: 5, max: Math.min(20, users.length) });
    const group = await store.createGroup(
      {
        name: faker.company.catchPhrase().slice(0, 50),
        description: faker.company.buzzPhrase().slice(0, 300),
        ownerId: owner.id,
      },
      members.map((member) => member.id)
    );

    for (let j = 0; j < suggestionsPerGroup; j++) {
      const author = faker.helpers.arrayElement(members);
      const suggestion = await store.createSuggestion({
        groupId: group.id,
        authorId: author.id,
        title: faker.hacker.phrase().slice(0, 100),
        description: faker.lorem.sentences(2).slice(0, 1000),
      });
      for (const voter of faker.helpers.arrayElements(members, { min: 1, max: Math.min(8, members.length) })) {
        await store.voteSuggestion(suggestion.id, voter.id, faker.helpers.arrayElement(["up", "down"] as const));
      }
    }
  }

  console.log(`Seeded ${userCount} users, ${groupCount} groups, and ${groupCount * suggestionsPerGroup} suggestions.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
