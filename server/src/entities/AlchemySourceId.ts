import { Entity, PrimaryColumn, Column, ManyToOne, JoinColumn } from "typeorm";
import { AlchemyResult } from "./AlchemyResult";

@Entity("AlchemySourceIds")
export class AlchemySourceId {
  @PrimaryColumn({ type: "varchar", length: 36 })
  alchemyId: string;

  @PrimaryColumn({ type: "int" })
  position: number;

  @Column({ type: "varchar", length: 36 })
  sourceId: string;

  @ManyToOne(() => AlchemyResult, (alchemy) => alchemy.sourceIds, { onDelete: "CASCADE" })
  @JoinColumn({ name: "alchemyId" })
  alchemy: AlchemyResult;
}
