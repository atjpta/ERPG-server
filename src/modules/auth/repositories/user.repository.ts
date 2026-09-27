import { eq } from "drizzle-orm";
import type { Queryable } from "@/configs/postgres.config.js";
import { BaseRepository } from "@/core/repositories/base.repository.js";
import { Users } from "@/modules/auth/entities/user.entity.js";

export class UserRepository extends BaseRepository<typeof Users> {
    constructor() {
        super(Users);
    }

    async findByEmail(params: { email: string; dbOrTx?: Queryable }) {
        const { email, dbOrTx } = params;
        return this.findOne({ where: eq(Users.email, email), dbOrTx });
    }
}

export const UserRepo = new UserRepository();
