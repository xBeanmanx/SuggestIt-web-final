import { Entity, PrimaryColumn, Column, OneToMany, CreateDateColumn } from "typeorm";
import { Group } from "./Group";
import { GroupMember } from "./GroupMember";
import { Suggestion } from "./Suggestion";
import { SuggestionVote } from "./SuggestionVote";
import { AlchemyVote } from "./AlchemyVote";

export type AppRoleName = "ADMIN" | "USER";

@Entity("Users")
export class User {
  @PrimaryColumn({ type: "varchar", length: 36 })
  id: string;

  @Column({ type: "varchar", length: 255, unique: true })
  email: string;

  @Column({ type: "varchar", length: 255, nullable: true })
  username: string | null;

  @Column({ type: "varchar", length: 255, select: false })
  password: string;

  @Column({ type: "varchar", length: 255 })
  name: string;

  @Column({ type: "varchar", length: 500, nullable: true })
  avatarUrl: string | null;

  @Column({ type: "varchar", length: 50, default: "USER" })
  role: AppRoleName;

  @CreateDateColumn({ type: "datetime2" })
  createdAt: Date;

  @OneToMany(() => Group, (group) => group.owner)
  ownedGroups: Group[];

  @OneToMany(() => GroupMember, (member) => member.user)
  groupMemberships: GroupMember[];

  @OneToMany(() => Suggestion, (suggestion) => suggestion.author)
  suggestions: Suggestion[];

  @OneToMany(() => SuggestionVote, (vote) => vote.user)
  suggestionVotes: SuggestionVote[];

  @OneToMany(() => AlchemyVote, (vote) => vote.user)
  alchemyVotes: AlchemyVote[];
}