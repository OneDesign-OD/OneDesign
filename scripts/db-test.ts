import "dotenv/config";
import { prisma } from "@/lib/prisma";

async function main() {
  const created = await prisma.analysis.create({
    data: {
      sourceType: "url",
      sourceInput: "https://airbnb.com",
    },
  });
  console.log("Created row:", created);

  const found = await prisma.analysis.findUniqueOrThrow({
    where: { id: created.id },
  });
  console.log("Read back row:", found);

  await prisma.analysis.delete({ where: { id: created.id } });
  console.log("Cleaned up test row.");
}

main()
  .catch((err) => {
    console.error("DB connectivity test failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
