import {
  Entity,
  PrimaryColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  JoinColumn,
  Index,
} from "typeorm";
import { User } from "./User";
import { Group } from "./Group";

@Entity("GroupMembers")
@Index("IX_GroupMembers_groupId", ["groupId"])
export class GroupMember {
  @PrimaryColumn({ type: "varchar", length: 36 })
  userId: string;

  @PrimaryColumn({ type: "varchar", length: 36 })
  groupId: string;

  @Column({ type: "varchar", length: 20, enum: ["owner", "admin", "member"] })
  role: "owner" | "admin" | "member";

  @CreateDateColumn({ type: "datetime2" })
  joinedAt: Date;

  @ManyToOne(() => User, (user) => user.groupMemberships, { onDelete: "NO ACTION" })
  @JoinColumn({ name: "userId" })
  user: User;

  @ManyToOne(() => Group, (group) => group.members, { onDelete: "CASCADE" })
  @JoinColumn({ name: "groupId" })
  group: Group;
}
