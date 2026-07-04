import type { Paginator } from "@smithy/types";
import { ListCallAnalyticsCategoriesCommandInput, ListCallAnalyticsCategoriesCommandOutput } from "../commands/ListCallAnalyticsCategoriesCommand";
import type { TranscribePaginationConfiguration } from "./Interfaces";
/**
 * @public
 */
export declare const paginateListCallAnalyticsCategories: (config: TranscribePaginationConfiguration, input: ListCallAnalyticsCategoriesCommandInput, ...rest: any[]) => Paginator<ListCallAnalyticsCategoriesCommandOutput>;
