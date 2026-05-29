import { Entity, PrimaryColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from "typeorm";
import { User } from "./User";

@Entity("ChatMessages")
export class ChatMessage {
  @PrimaryColumn({ type: "varchar", length: 36 })
  id: string;

  @Column({ type: "varchar", length: 36 })
  conversationId: string;

  @Column({ type: "varchar", length: 36 })
  userId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: "userId" })
  user: User;

  @Column({ type: "nvarchar", length: 2000 })
  content: string;

  @CreateDateColumn({ type: "datetime2" })
  createdAt: Date;
}
