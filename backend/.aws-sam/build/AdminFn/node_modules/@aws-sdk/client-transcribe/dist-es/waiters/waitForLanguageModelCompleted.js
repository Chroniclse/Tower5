import { checkExceptions, createWaiter, WaiterState, } from "@smithy/core/client";
import { DescribeLanguageModelCommand, } from "../commands/DescribeLanguageModelCommand";
const checkState = async (client, input) => {
    let reason;
    try {
        let result = await client.send(new DescribeLanguageModelCommand(input));
        reason = result;
        try {
            const returnComparator = () => {
                return result.LanguageModel.ModelStatus;
            };
            if (returnComparator() === "COMPLETED") {
                return { state: WaiterState.SUCCESS, reason };
            }
        }
        catch (e) { }
        try {
            const returnComparator = () => {
                return result.LanguageModel.ModelStatus;
            };
            if (returnComparator() === "FAILED") {
                return { state: WaiterState.FAILURE, reason };
            }
        }
        catch (e) { }
    }
    catch (exception) {
        reason = exception;
    }
    return { state: WaiterState.RETRY, reason };
};
export const waitForLanguageModelCompleted = async (params, input) => {
    const serviceDefaults = { minDelay: 120, maxDelay: 120 };
    return createWaiter({ ...serviceDefaults, ...params }, input, checkState);
};
export const waitUntilLanguageModelCompleted = async (params, input) => {
    const serviceDefaults = { minDelay: 120, maxDelay: 120 };
    const result = await createWaiter({ ...serviceDefaults, ...params }, input, checkState);
    return checkExceptions(result);
};
