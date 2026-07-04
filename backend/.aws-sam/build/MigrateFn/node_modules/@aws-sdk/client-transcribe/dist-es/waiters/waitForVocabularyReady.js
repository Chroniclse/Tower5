import { checkExceptions, createWaiter, WaiterState, } from "@smithy/core/client";
import { GetVocabularyCommand, } from "../commands/GetVocabularyCommand";
const checkState = async (client, input) => {
    let reason;
    try {
        let result = await client.send(new GetVocabularyCommand(input));
        reason = result;
        try {
            const returnComparator = () => {
                return result.VocabularyState;
            };
            if (returnComparator() === "READY") {
                return { state: WaiterState.SUCCESS, reason };
            }
        }
        catch (e) { }
        try {
            const returnComparator = () => {
                return result.VocabularyState;
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
export const waitForVocabularyReady = async (params, input) => {
    const serviceDefaults = { minDelay: 10, maxDelay: 120 };
    return createWaiter({ ...serviceDefaults, ...params }, input, checkState);
};
export const waitUntilVocabularyReady = async (params, input) => {
    const serviceDefaults = { minDelay: 10, maxDelay: 120 };
    const result = await createWaiter({ ...serviceDefaults, ...params }, input, checkState);
    return checkExceptions(result);
};
