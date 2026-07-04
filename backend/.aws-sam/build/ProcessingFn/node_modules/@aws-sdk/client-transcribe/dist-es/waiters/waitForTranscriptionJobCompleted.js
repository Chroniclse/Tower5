import { checkExceptions, createWaiter, WaiterState, } from "@smithy/core/client";
import { GetTranscriptionJobCommand, } from "../commands/GetTranscriptionJobCommand";
const checkState = async (client, input) => {
    let reason;
    try {
        let result = await client.send(new GetTranscriptionJobCommand(input));
        reason = result;
        try {
            const returnComparator = () => {
                return result.TranscriptionJob.TranscriptionJobStatus;
            };
            if (returnComparator() === "COMPLETED") {
                return { state: WaiterState.SUCCESS, reason };
            }
        }
        catch (e) { }
        try {
            const returnComparator = () => {
                return result.TranscriptionJob.TranscriptionJobStatus;
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
export const waitForTranscriptionJobCompleted = async (params, input) => {
    const serviceDefaults = { minDelay: 10, maxDelay: 120 };
    return createWaiter({ ...serviceDefaults, ...params }, input, checkState);
};
export const waitUntilTranscriptionJobCompleted = async (params, input) => {
    const serviceDefaults = { minDelay: 10, maxDelay: 120 };
    const result = await createWaiter({ ...serviceDefaults, ...params }, input, checkState);
    return checkExceptions(result);
};
