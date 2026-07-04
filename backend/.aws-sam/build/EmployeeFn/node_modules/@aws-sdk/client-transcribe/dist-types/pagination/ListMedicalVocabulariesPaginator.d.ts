import type { Paginator } from "@smithy/types";
import { ListMedicalVocabulariesCommandInput, ListMedicalVocabulariesCommandOutput } from "../commands/ListMedicalVocabulariesCommand";
import type { TranscribePaginationConfiguration } from "./Interfaces";
/**
 * @public
 */
export declare const paginateListMedicalVocabularies: (config: TranscribePaginationConfiguration, input: ListMedicalVocabulariesCommandInput, ...rest: any[]) => Paginator<ListMedicalVocabulariesCommandOutput>;
