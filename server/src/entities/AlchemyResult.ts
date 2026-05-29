import {
  Entity,
  PrimaryColumn,
  Column,
  ManyToOne,
  OneToMany,
  CreateDateColumn,
  JoinColumn,
  Index,
} from "typeorm";
import { Group } from "./Group";
import { AlchemySourceId } from "./AlchemySourceId";
import { AlchemyVote } from "./AlchemyVote";

@Entity("AlchemyResults")
@Index("IX_AlchemyResults_groupId_createdAt", ["groupId", "createdAt"])
export class AlchemyResult {
  @PrimaryColumn({ type: "varchar", length: 36 })
  id: string;

  @Column({ type: "varchar", length: 36 })
  groupId: string;

  @Column({ type: "varchar", length: 255 })
  title: string;

  @Column({ type: "varchar", length: "max", nullable: true })
  description: string | null;

  @Column({ type: "int", default: 0 })
  depth: number;

  @CreateDateColumn({ type: "datetime2" })
  createdAt: Date;

  @ManyToOne(() => Group, (group) => group.alchemyResults, { onDelete: "CASCADE" })
  @JoinColumn({ name: "groupId" })
  group: Group;

  @OneToMany(() => AlchemySourceId, (source) => source.alchemy)
  sourceIds: AlchemySourceId[];

  @OneToMany(() => AlchemyVote, (vote) => vote.alchemy)
  votes: AlchemyVote[];
}
