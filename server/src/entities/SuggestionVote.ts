import { Entity, PrimaryColumn, Column, ManyToOne, JoinColumn, Index } from "typeorm";
import { Suggestion } from "./Suggestion";
import { User } from "./User";

@Entity("SuggestionVotes")
@Index("IX_SuggestionVotes_suggestionId", ["suggestionId"])
export class SuggestionVote {
  @PrimaryColumn({ type: "varchar", length: 36 })
  suggestionId: string;

  @PrimaryColumn({ type: "varchar", length: 36 })
  userId: string;

  @Column({ type: "varchar", length: 10, enum: ["up", "down"] })
  vote: "up" | "down";

  @ManyToOne(() => Suggestion, (suggestion) => suggestion.votes, { onDelete: "CASCADE" })
  @JoinColumn({ name: "suggestionId" })
  suggestion: Suggestion;

  @ManyToOne(() => User, (user) => user.suggestionVotes, { onDelete: "NO ACTION" })
  @JoinColumn({ name: "userId" })
  user: User;
}
