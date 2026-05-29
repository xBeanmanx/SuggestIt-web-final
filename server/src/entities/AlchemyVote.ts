import { Entity, PrimaryColumn, Column, ManyToOne, JoinColumn } from "typeorm";
import { AlchemyResult } from "./AlchemyResult";
import { User } from "./User";

@Entity("AlchemyVotes")
export class AlchemyVote {
  @PrimaryColumn({ type: "varchar", length: 36 })
  alchemyId: string;

  @PrimaryColumn({ type: "varchar", length: 36 })
  userId: string;

  @Column({ type: "varchar", length: 10, enum: ["up", "down"] })
  vote: "up" | "down";

  @ManyToOne(() => AlchemyResult, (alchemy) => alchemy.votes, { onDelete: "CASCADE" })
  @JoinColumn({ name: "alchemyId" })
  alchemy: AlchemyResult;

  @ManyToOne(() => User, (user) => user.alchemyVotes, { onDelete: "NO ACTION" })
  @JoinColumn({ name: "userId" })
  user: User;
}
