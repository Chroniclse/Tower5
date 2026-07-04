import type { Paginator } from "@smithy/types";
import { ListLanguageModelsCommandInput, ListLanguageModelsCommandOutput } from "../commands/ListLanguageModelsCommand";
import type { TranscribePaginationConfiguration } from "./Interfaces";
/**
 * @public
 */
export declare const paginateListLanguageModels: (config: TranscribePaginationConfiguration, input: ListLanguageModelsCommandInput, ...rest: any[]) => Paginator<ListLanguageModelsCommandOutput>;
