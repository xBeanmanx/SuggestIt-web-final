import { createStore } from "./store-factory.js";
import { seedStore } from "./seed.js";

async function main() {
  console.log("Starting seed process...");
  const store = await createStore();
  
  await seedStore(store);
  console.log("Seeding complete!");
}

main().catch((error) => {
  console.error("Seed failed:", error);
  process.exit(1);
});
