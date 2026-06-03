import { Entity, PrimaryColumn, Column, ManyToMany, JoinTable, CreateDateColumn, UpdateDateColumn } from "typeorm";
import { User } from "./User";

@Entity("ChatConversations")
export class ChatConversation {
  @PrimaryColumn({ type: "varchar", length: 36 })
  id: string;

  @Column({ type: "varchar", length: 255, nullable: true })
  name: string | null;

  @Column({ type: "varchar", length: 36 })
  groupId: string;

  @Column({ type: "bit", default: false })
  isGroupChat: boolean;

  @ManyToMany(() => User)
  @JoinTable({ name: "ChatConversationMembers" })
  members: User[];

  @Column({ type: "int", default: 0 })
  messageCount: number;

  @CreateDateColumn({ type: "datetime2" })
  createdAt: Date;

  @UpdateDateColumn({ type: "datetime2" })
  updatedAt: Date;
}
