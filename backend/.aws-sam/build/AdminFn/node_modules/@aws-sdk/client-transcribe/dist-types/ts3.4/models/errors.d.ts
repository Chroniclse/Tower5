import { ExceptionOptionType as __ExceptionOptionType } from "@smithy/core/client";
import { TranscribeServiceException as __BaseException } from "./TranscribeServiceException";
export declare class BadRequestException extends __BaseException {
  readonly name: "BadRequestException";
  readonly $fault: "client";
  Message?: string | undefined;
  constructor(
    opts: __ExceptionOptionType<BadRequestException, __BaseException>
  );
}
export declare class ConflictException extends __BaseException {
  readonly name: "ConflictException";
  readonly $fault: "client";
  Message?: string | undefined;
  constructor(opts: __ExceptionOptionType<ConflictException, __BaseException>);
}
export declare class InternalFailureException extends __BaseException {
  readonly name: "InternalFailureException";
  readonly $fault: "server";
  Message?: string | undefined;
  constructor(
    opts: __ExceptionOptionType<InternalFailureException, __BaseException>
  );
}
export declare class LimitExceededException extends __BaseException {
  readonly name: "LimitExceededException";
  readonly $fault: "client";
  Message?: string | undefined;
  constructor(
    opts: __ExceptionOptionType<LimitExceededException, __BaseException>
  );
}
export declare class NotFoundException extends __BaseException {
  readonly name: "NotFoundException";
  readonly $fault: "client";
  Message?: string | undefined;
  constructor(opts: __ExceptionOptionType<NotFoundException, __BaseException>);
}
