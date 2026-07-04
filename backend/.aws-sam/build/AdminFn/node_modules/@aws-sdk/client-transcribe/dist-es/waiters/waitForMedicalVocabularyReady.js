import { checkExceptions, createWaiter, WaiterState, } from "@smithy/core/client";
import { GetMedicalVocabularyCommand, } from "../commands/GetMedicalVocabularyCommand";
const checkState = async (client, input) => {
    let reason;
    try {
        let result = await client.send(new GetMedicalVocabularyCommand(input));
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
export const waitForMedicalVocabularyReady = async (params, input) => {
    const serviceDefaults = { minDelay: 10, maxDelay: 120 };
    return createWaiter({ ...serviceDefaults, ...params }, input, checkState);
};
export const waitUntilMedicalVocabularyReady = async (params, input) => {
    const serviceDefaults = { minDelay: 10, maxDelay: 120 };
    const result = await createWaiter({ ...serviceDefaults, ...params }, input, checkState);
    return checkExceptions(result);
};
