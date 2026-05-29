import {
  Entity,
  PrimaryColumn,
  Column,
  ManyToOne,
  OneToMany,
  CreateDateColumn,
  JoinColumn,
} from "typeorm";
import { User } from "./User";
import { GroupMember } from "./GroupMember";
import { Suggestion } from "./Suggestion";
import { AlchemyResult } from "./AlchemyResult";

@Entity("Groups")
export class Group {
  @PrimaryColumn({ type: "varchar", length: 36 })
  id: string;

  @Column({ type: "varchar", length: 255 })
  name: string;

  @Column({ type: "varchar", length: "max", nullable: true })
  description: string | null;

  @Column({ type: "varchar", length: 10, unique: true })
  inviteCode: string;

  @Column({ type: "varchar", length: 36 })
  ownerId: string;

  @CreateDateColumn({ type: "datetime2" })
  createdAt: Date;

  @ManyToOne(() => User, (user) => user.ownedGroups, { onDelete: "CASCADE" })
  @JoinColumn({ name: "ownerId" })
  owner: User;

  @OneToMany(() => GroupMember, (member) => member.group)
  members: GroupMember[];

  @OneToMany(() => Suggestion, (suggestion) => suggestion.group)
  suggestions: Suggestion[];

  @OneToMany(() => AlchemyResult, (alchemy) => alchemy.group)
  alchemyResults: AlchemyResult[];
}
