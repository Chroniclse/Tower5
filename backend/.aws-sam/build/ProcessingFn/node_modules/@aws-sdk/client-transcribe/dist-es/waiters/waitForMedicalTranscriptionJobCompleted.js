import { checkExceptions, createWaiter, WaiterState, } from "@smithy/core/client";
import { GetMedicalTranscriptionJobCommand, } from "../commands/GetMedicalTranscriptionJobCommand";
const checkState = async (client, input) => {
    let reason;
    try {
        let result = await client.send(new GetMedicalTranscriptionJobCommand(input));
        reason = result;
        try {
            const returnComparator = () => {
                return result.MedicalTranscriptionJob.TranscriptionJobStatus;
            };
            if (returnComparator() === "COMPLETED") {
                return { state: WaiterState.SUCCESS, reason };
            }
        }
        catch (e) { }
        try {
            const returnComparator = () => {
                return result.MedicalTranscriptionJob.TranscriptionJobStatus;
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
export const waitForMedicalTranscriptionJobCompleted = async (params, input) => {
    const serviceDefaults = { minDelay: 10, maxDelay: 120 };
    return createWaiter({ ...serviceDefaults, ...params }, input, checkState);
};
export const waitUntilMedicalTranscriptionJobCompleted = async (params, input) => {
    const serviceDefaults = { minDelay: 10, maxDelay: 120 };
    const result = await createWaiter({ ...serviceDefaults, ...params }, input, checkState);
    return checkExceptions(result);
};
