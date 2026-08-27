import { db } from "@repo/db";
import { usersTable } from "@repo/db/schema";
import { eq } from "drizzle-orm";

class UserService {
  async getUserById(id: string) {
    const user = await db.select().from(usersTable).where(eq(usersTable.id, id)).limit(1);
    return user[0] ?? null;
  }

  async getUserByEmail(email: string) {
    const user = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
    return user[0] ?? null;
  }
}

export default UserService;
