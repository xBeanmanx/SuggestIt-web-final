const endpoint = process.env.GQL_ENDPOINT ?? "http://localhost:4000/graphql";

async function gql(query: string, variables?: Record<string, unknown>, accessToken?: string) {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify({ query, variables }),
  });
  return res.json() as Promise<any>;
}

async function main() {
  const suffix = Date.now().toString(36);
  const registered = await gql(
    `mutation Register($input: RegisterInput!) {
      register(input: $input) { accessToken user { id } }
    }`,
    {
      input: {
        username: `bot_${suffix}`,
        email: `bot_${suffix}@test.local`,
        name: "Suspicious Bot",
        password: "password123",
      },
    }
  );

  const accessToken = registered.data.register.accessToken as string;
  const userId = registered.data.register.user.id as string;

  for (let i = 0; i < 8; i++) {
    await gql(
      `mutation CreateGroup($input: CreateGroupInput!) {
        createGroup(input: $input) { id }
      }`,
      {
        input: {
          name: `Bot Group ${i}`,
          description: "Rapid automated group creation for suspicious activity simulation.",
          memberIds: [userId],
        },
      },
      accessToken
    );
  }

  console.log(`Suspicious simulation completed for ${userId}. Check Admin observations after the activity monitor interval.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
