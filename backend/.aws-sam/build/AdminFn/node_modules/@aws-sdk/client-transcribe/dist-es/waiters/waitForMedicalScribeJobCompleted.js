import { checkExceptions, createWaiter, WaiterState, } from "@smithy/core/client";
import { GetMedicalScribeJobCommand, } from "../commands/GetMedicalScribeJobCommand";
const checkState = async (client, input) => {
    let reason;
    try {
        let result = await client.send(new GetMedicalScribeJobCommand(input));
        reason = result;
        try {
            const returnComparator = () => {
                return result.MedicalScribeJob.MedicalScribeJobStatus;
            };
            if (returnComparator() === "COMPLETED") {
                return { state: WaiterState.SUCCESS, reason };
            }
        }
        catch (e) { }
        try {
            const returnComparator = () => {
                return result.MedicalScribeJob.MedicalScribeJobStatus;
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
export const waitForMedicalScribeJobCompleted = async (params, input) => {
    const serviceDefaults = { minDelay: 10, maxDelay: 120 };
    return createWaiter({ ...serviceDefaults, ...params }, input, checkState);
};
export const waitUntilMedicalScribeJobCompleted = async (params, input) => {
    const serviceDefaults = { minDelay: 10, maxDelay: 120 };
    const result = await createWaiter({ ...serviceDefaults, ...params }, input, checkState);
    return checkExceptions(result);
};
