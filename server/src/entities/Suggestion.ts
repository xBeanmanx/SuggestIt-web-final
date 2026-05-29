import {
  Entity,
  PrimaryColumn,
  Column,
  ManyToOne,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn,
  Index,
} from "typeorm";
import { Group } from "./Group";
import { User } from "./User";
import { SuggestionVote } from "./SuggestionVote";

@Entity("Suggestions")
@Index("IX_Suggestions_groupId_createdAt", ["groupId", "createdAt"])
export class Suggestion {
  @PrimaryColumn({ type: "varchar", length: 36 })
  id: string;

  @Column({ type: "varchar", length: 36 })
  groupId: string;

  @Column({ type: "varchar", length: 36 })
  authorId: string;

  @Column({ type: "varchar", length: 100 })
  title: string;

  @Column({ type: "varchar", length: "max" })
  description: string;

  @Column({
    type: "varchar",
    length: 20,
    default: "open",
    enum: ["open", "under_review", "accepted", "rejected"],
  })
  status: "open" | "under_review" | "accepted" | "rejected";

  @CreateDateColumn({ type: "datetime2" })
  createdAt: Date;

  @UpdateDateColumn({ type: "datetime2" })
  updatedAt: Date;

  @ManyToOne(() => Group, (group) => group.suggestions, { onDelete: "CASCADE" })
  @JoinColumn({ name: "groupId" })
  group: Group;

  @ManyToOne(() => User, (user) => user.suggestions, { onDelete: "NO ACTION" })
  @JoinColumn({ name: "authorId" })
  author: User;

  @OneToMany(() => SuggestionVote, (vote) => vote.suggestion)
  votes: SuggestionVote[];
}
