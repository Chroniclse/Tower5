import {
  BaseModelName,
  CallAnalyticsFeature,
  CallAnalyticsJobStatus,
  CallAnalyticsSkippedReasonCode,
  CLMLanguageCode,
  InputType,
  LanguageCode,
  MediaFormat,
  MedicalContentIdentificationType,
  MedicalScribeJobStatus,
  MedicalScribeLanguageCode,
  MedicalScribeNoteTemplate,
  MedicalScribeParticipantRole,
  ModelStatus,
  OutputLocationType,
  ParticipantRole,
  PiiEntityType,
  Pronouns,
  RedactionOutput,
  RedactionType,
  SentimentValue,
  Specialty,
  SubtitleFormat,
  ToxicityCategory,
  TranscriptFilterType,
  TranscriptionJobStatus,
  Type,
  VocabularyFilterMethod,
  VocabularyState,
} from "./enums";
export interface AbsoluteTimeRange {
  StartTime?: number | undefined;
  EndTime?: number | undefined;
  First?: number | undefined;
  Last?: number | undefined;
}
export interface CallAnalyticsSkippedFeature {
  Feature?: CallAnalyticsFeature | undefined;
  ReasonCode?: CallAnalyticsSkippedReasonCode | undefined;
  Message?: string | undefined;
}
export interface CallAnalyticsJobDetails {
  Skipped?: CallAnalyticsSkippedFeature[] | undefined;
}
export interface ChannelDefinition {
  ChannelId?: number | undefined;
  ParticipantRole?: ParticipantRole | undefined;
}
export interface Media {
  MediaFileUri?: string | undefined;
  RedactedMediaFileUri?: string | undefined;
}
export interface ContentRedaction {
  RedactionType: RedactionType | undefined;
  RedactionOutput: RedactionOutput | undefined;
  PiiEntityTypes?: PiiEntityType[] | undefined;
}
export interface LanguageIdSettings {
  VocabularyName?: string | undefined;
  VocabularyFilterName?: string | undefined;
  LanguageModelName?: string | undefined;
}
export interface Summarization {
  GenerateAbstractiveSummary: boolean | undefined;
}
export interface CallAnalyticsJobSettings {
  VocabularyName?: string | undefined;
  VocabularyFilterName?: string | undefined;
  VocabularyFilterMethod?: VocabularyFilterMethod | undefined;
  LanguageModelName?: string | undefined;
  ContentRedaction?: ContentRedaction | undefined;
  LanguageOptions?: LanguageCode[] | undefined;
  LanguageIdSettings?:
    | Partial<Record<LanguageCode, LanguageIdSettings>>
    | undefined;
  Summarization?: Summarization | undefined;
}
export interface Tag {
  Key: string | undefined;
  Value: string | undefined;
}
export interface Transcript {
  TranscriptFileUri?: string | undefined;
  RedactedTranscriptFileUri?: string | undefined;
}
export interface CallAnalyticsJob {
  CallAnalyticsJobName?: string | undefined;
  CallAnalyticsJobStatus?: CallAnalyticsJobStatus | undefined;
  CallAnalyticsJobDetails?: CallAnalyticsJobDetails | undefined;
  LanguageCode?: LanguageCode | undefined;
  MediaSampleRateHertz?: number | undefined;
  MediaFormat?: MediaFormat | undefined;
  Media?: Media | undefined;
  Transcript?: Transcript | undefined;
  StartTime?: Date | undefined;
  CreationTime?: Date | undefined;
  CompletionTime?: Date | undefined;
  FailureReason?: string | undefined;
  DataAccessRoleArn?: string | undefined;
  IdentifiedLanguageScore?: number | undefined;
  Settings?: CallAnalyticsJobSettings | undefined;
  ChannelDefinitions?: ChannelDefinition[] | undefined;
  Tags?: Tag[] | undefined;
}
export interface CallAnalyticsJobSummary {
  CallAnalyticsJobName?: string | undefined;
  CreationTime?: Date | undefined;
  StartTime?: Date | undefined;
  CompletionTime?: Date | undefined;
  LanguageCode?: LanguageCode | undefined;
  CallAnalyticsJobStatus?: CallAnalyticsJobStatus | undefined;
  CallAnalyticsJobDetails?: CallAnalyticsJobDetails | undefined;
  FailureReason?: string | undefined;
}
export interface RelativeTimeRange {
  StartPercentage?: number | undefined;
  EndPercentage?: number | undefined;
  First?: number | undefined;
  Last?: number | undefined;
}
export interface InterruptionFilter {
  Threshold?: number | undefined;
  ParticipantRole?: ParticipantRole | undefined;
  AbsoluteTimeRange?: AbsoluteTimeRange | undefined;
  RelativeTimeRange?: RelativeTimeRange | undefined;
  Negate?: boolean | undefined;
}
export interface NonTalkTimeFilter {
  Threshold?: number | undefined;
  AbsoluteTimeRange?: AbsoluteTimeRange | undefined;
  RelativeTimeRange?: RelativeTimeRange | undefined;
  Negate?: boolean | undefined;
}
export interface SentimentFilter {
  Sentiments: SentimentValue[] | undefined;
  AbsoluteTimeRange?: AbsoluteTimeRange | undefined;
  RelativeTimeRange?: RelativeTimeRange | undefined;
  ParticipantRole?: ParticipantRole | undefined;
  Negate?: boolean | undefined;
}
export interface TranscriptFilter {
  TranscriptFilterType: TranscriptFilterType | undefined;
  AbsoluteTimeRange?: AbsoluteTimeRange | undefined;
  RelativeTimeRange?: RelativeTimeRange | undefined;
  ParticipantRole?: ParticipantRole | undefined;
  Negate?: boolean | undefined;
  Targets: string[] | undefined;
}
export type Rule =
  | Rule.InterruptionFilterMember
  | Rule.NonTalkTimeFilterMember
  | Rule.SentimentFilterMember
  | Rule.TranscriptFilterMember
  | Rule.$UnknownMember;
export declare namespace Rule {
  interface NonTalkTimeFilterMember {
    NonTalkTimeFilter: NonTalkTimeFilter;
    InterruptionFilter?: never;
    TranscriptFilter?: never;
    SentimentFilter?: never;
    $unknown?: never;
  }
  interface InterruptionFilterMember {
    NonTalkTimeFilter?: never;
    InterruptionFilter: InterruptionFilter;
    TranscriptFilter?: never;
    SentimentFilter?: never;
    $unknown?: never;
  }
  interface TranscriptFilterMember {
    NonTalkTimeFilter?: never;
    InterruptionFilter?: never;
    TranscriptFilter: TranscriptFilter;
    SentimentFilter?: never;
    $unknown?: never;
  }
  interface SentimentFilterMember {
    NonTalkTimeFilter?: never;
    InterruptionFilter?: never;
    TranscriptFilter?: never;
    SentimentFilter: SentimentFilter;
    $unknown?: never;
  }
  interface $UnknownMember {
    NonTalkTimeFilter?: never;
    InterruptionFilter?: never;
    TranscriptFilter?: never;
    SentimentFilter?: never;
    $unknown: [string, any];
  }
  interface Visitor<T> {
    NonTalkTimeFilter: (value: NonTalkTimeFilter) => T;
    InterruptionFilter: (value: InterruptionFilter) => T;
    TranscriptFilter: (value: TranscriptFilter) => T;
    SentimentFilter: (value: SentimentFilter) => T;
    _: (name: string, value: any) => T;
  }
}
export interface CategoryProperties {
  CategoryName?: string | undefined;
  Rules?: Rule[] | undefined;
  CreateTime?: Date | undefined;
  LastUpdateTime?: Date | undefined;
  Tags?: Tag[] | undefined;
  InputType?: InputType | undefined;
}
export interface ClinicalNoteGenerationSettings {
  NoteTemplate?: MedicalScribeNoteTemplate | undefined;
}
export interface CreateCallAnalyticsCategoryRequest {
  CategoryName: string | undefined;
  Rules: Rule[] | undefined;
  Tags?: Tag[] | undefined;
  InputType?: InputType | undefined;
}
export interface CreateCallAnalyticsCategoryResponse {
  CategoryProperties?: CategoryProperties | undefined;
}
export interface InputDataConfig {
  S3Uri: string | undefined;
  TuningDataS3Uri?: string | undefined;
  DataAccessRoleArn: string | undefined;
}
export interface CreateLanguageModelRequest {
  LanguageCode: CLMLanguageCode | undefined;
  BaseModelName: BaseModelName | undefined;
  ModelName: string | undefined;
  InputDataConfig: InputDataConfig | undefined;
  Tags?: Tag[] | undefined;
}
export interface CreateLanguageModelResponse {
  LanguageCode?: CLMLanguageCode | undefined;
  BaseModelName?: BaseModelName | undefined;
  ModelName?: string | undefined;
  InputDataConfig?: InputDataConfig | undefined;
  ModelStatus?: ModelStatus | undefined;
}
export interface CreateMedicalVocabularyRequest {
  VocabularyName: string | undefined;
  LanguageCode: LanguageCode | undefined;
  VocabularyFileUri: string | undefined;
  Tags?: Tag[] | undefined;
}
export interface CreateMedicalVocabularyResponse {
  VocabularyName?: string | undefined;
  LanguageCode?: LanguageCode | undefined;
  VocabularyState?: VocabularyState | undefined;
  LastModifiedTime?: Date | undefined;
  FailureReason?: string | undefined;
}
export interface CreateVocabularyRequest {
  VocabularyName: string | undefined;
  LanguageCode: LanguageCode | undefined;
  Phrases?: string[] | undefined;
  VocabularyFileUri?: string | undefined;
  Tags?: Tag[] | undefined;
  DataAccessRoleArn?: string | undefined;
}
export interface CreateVocabularyResponse {
  VocabularyName?: string | undefined;
  LanguageCode?: LanguageCode | undefined;
  VocabularyState?: VocabularyState | undefined;
  LastModifiedTime?: Date | undefined;
  FailureReason?: string | undefined;
}
export interface CreateVocabularyFilterRequest {
  VocabularyFilterName: string | undefined;
  LanguageCode: LanguageCode | undefined;
  Words?: string[] | undefined;
  VocabularyFilterFileUri?: string | undefined;
  Tags?: Tag[] | undefined;
  DataAccessRoleArn?: string | undefined;
}
export interface CreateVocabularyFilterResponse {
  VocabularyFilterName?: string | undefined;
  LanguageCode?: LanguageCode | undefined;
  LastModifiedTime?: Date | undefined;
}
export interface DeleteCallAnalyticsCategoryRequest {
  CategoryName: string | undefined;
}
export interface DeleteCallAnalyticsCategoryResponse {}
export interface DeleteCallAnalyticsJobRequest {
  CallAnalyticsJobName: string | undefined;
}
export interface DeleteCallAnalyticsJobResponse {}
export interface DeleteLanguageModelRequest {
  ModelName: string | undefined;
}
export interface DeleteMedicalScribeJobRequest {
  MedicalScribeJobName: string | undefined;
}
export interface DeleteMedicalTranscriptionJobRequest {
  MedicalTranscriptionJobName: string | undefined;
}
export interface DeleteMedicalVocabularyRequest {
  VocabularyName: string | undefined;
}
export interface DeleteTranscriptionJobRequest {
  TranscriptionJobName: string | undefined;
}
export interface DeleteVocabularyRequest {
  VocabularyName: string | undefined;
}
export interface DeleteVocabularyFilterRequest {
  VocabularyFilterName: string | undefined;
}
export interface DescribeLanguageModelRequest {
  ModelName: string | undefined;
}
export interface LanguageModel {
  ModelName?: string | undefined;
  CreateTime?: Date | undefined;
  LastModifiedTime?: Date | undefined;
  LanguageCode?: CLMLanguageCode | undefined;
  BaseModelName?: BaseModelName | undefined;
  ModelStatus?: ModelStatus | undefined;
  UpgradeAvailability?: boolean | undefined;
  FailureReason?: string | undefined;
  InputDataConfig?: InputDataConfig | undefined;
}
export interface DescribeLanguageModelResponse {
  LanguageModel?: LanguageModel | undefined;
}
export interface GetCallAnalyticsCategoryRequest {
  CategoryName: string | undefined;
}
export interface GetCallAnalyticsCategoryResponse {
  CategoryProperties?: CategoryProperties | undefined;
}
export interface GetCallAnalyticsJobRequest {
  CallAnalyticsJobName: string | undefined;
}
export interface GetCallAnalyticsJobResponse {
  CallAnalyticsJob?: CallAnalyticsJob | undefined;
}
export interface GetMedicalScribeJobRequest {
  MedicalScribeJobName: string | undefined;
}
export interface MedicalScribeChannelDefinition {
  ChannelId: number | undefined;
  ParticipantRole: MedicalScribeParticipantRole | undefined;
}
export interface MedicalScribeOutput {
  TranscriptFileUri: string | undefined;
  ClinicalDocumentUri: string | undefined;
}
export interface MedicalScribeSettings {
  ShowSpeakerLabels?: boolean | undefined;
  MaxSpeakerLabels?: number | undefined;
  ChannelIdentification?: boolean | undefined;
  VocabularyName?: string | undefined;
  VocabularyFilterName?: string | undefined;
  VocabularyFilterMethod?: VocabularyFilterMethod | undefined;
  ClinicalNoteGenerationSettings?: ClinicalNoteGenerationSettings | undefined;
}
export interface MedicalScribeJob {
  MedicalScribeJobName?: string | undefined;
  MedicalScribeJobStatus?: MedicalScribeJobStatus | undefined;
  LanguageCode?: MedicalScribeLanguageCode | undefined;
  Media?: Media | undefined;
  MedicalScribeOutput?: MedicalScribeOutput | undefined;
  StartTime?: Date | undefined;
  CreationTime?: Date | undefined;
  CompletionTime?: Date | undefined;
  FailureReason?: string | undefined;
  Settings?: MedicalScribeSettings | undefined;
  DataAccessRoleArn?: string | undefined;
  ChannelDefinitions?: MedicalScribeChannelDefinition[] | undefined;
  MedicalScribeContextProvided?: boolean | undefined;
  Tags?: Tag[] | undefined;
}
export interface GetMedicalScribeJobResponse {
  MedicalScribeJob?: MedicalScribeJob | undefined;
}
export interface GetMedicalTranscriptionJobRequest {
  MedicalTranscriptionJobName: string | undefined;
}
export interface MedicalTranscriptionSetting {
  ShowSpeakerLabels?: boolean | undefined;
  MaxSpeakerLabels?: number | undefined;
  ChannelIdentification?: boolean | undefined;
  ShowAlternatives?: boolean | undefined;
  MaxAlternatives?: number | undefined;
  VocabularyName?: string | undefined;
}
export interface MedicalTranscript {
  TranscriptFileUri?: string | undefined;
}
export interface MedicalTranscriptionJob {
  MedicalTranscriptionJobName?: string | undefined;
  TranscriptionJobStatus?: TranscriptionJobStatus | undefined;
  LanguageCode?: LanguageCode | undefined;
  MediaSampleRateHertz?: number | undefined;
  MediaFormat?: MediaFormat | undefined;
  Media?: Media | undefined;
  Transcript?: MedicalTranscript | undefined;
  StartTime?: Date | undefined;
  CreationTime?: Date | undefined;
  CompletionTime?: Date | undefined;
  FailureReason?: string | undefined;
  Settings?: MedicalTranscriptionSetting | undefined;
  ContentIdentificationType?: MedicalContentIdentificationType | undefined;
  Specialty?: Specialty | undefined;
  Type?: Type | undefined;
  Tags?: Tag[] | undefined;
}
export interface GetMedicalTranscriptionJobResponse {
  MedicalTranscriptionJob?: MedicalTranscriptionJob | undefined;
}
export interface GetMedicalVocabularyRequest {
  VocabularyName: string | undefined;
}
export interface GetMedicalVocabularyResponse {
  VocabularyName?: string | undefined;
  LanguageCode?: LanguageCode | undefined;
  VocabularyState?: VocabularyState | undefined;
  LastModifiedTime?: Date | undefined;
  FailureReason?: string | undefined;
  DownloadUri?: string | undefined;
}
export interface GetTranscriptionJobRequest {
  TranscriptionJobName: string | undefined;
}
export interface JobExecutionSettings {
  AllowDeferredExecution?: boolean | undefined;
  DataAccessRoleArn?: string | undefined;
}
export interface LanguageCodeItem {
  LanguageCode?: LanguageCode | undefined;
  DurationInSeconds?: number | undefined;
}
export interface ModelSettings {
  LanguageModelName?: string | undefined;
}
export interface Settings {
  VocabularyName?: string | undefined;
  ShowSpeakerLabels?: boolean | undefined;
  MaxSpeakerLabels?: number | undefined;
  ChannelIdentification?: boolean | undefined;
  ShowAlternatives?: boolean | undefined;
  MaxAlternatives?: number | undefined;
  VocabularyFilterName?: string | undefined;
  VocabularyFilterMethod?: VocabularyFilterMethod | undefined;
}
export interface SubtitlesOutput {
  Formats?: SubtitleFormat[] | undefined;
  SubtitleFileUris?: string[] | undefined;
  OutputStartIndex?: number | undefined;
}
export interface ToxicityDetectionSettings {
  ToxicityCategories: ToxicityCategory[] | undefined;
}
export interface TranscriptionJob {
  TranscriptionJobName?: string | undefined;
  TranscriptionJobStatus?: TranscriptionJobStatus | undefined;
  LanguageCode?: LanguageCode | undefined;
  MediaSampleRateHertz?: number | undefined;
  MediaFormat?: MediaFormat | undefined;
  Media?: Media | undefined;
  Transcript?: Transcript | undefined;
  StartTime?: Date | undefined;
  CreationTime?: Date | undefined;
  CompletionTime?: Date | undefined;
  FailureReason?: string | undefined;
  Settings?: Settings | undefined;
  ModelSettings?: ModelSettings | undefined;
  JobExecutionSettings?: JobExecutionSettings | undefined;
  ContentRedaction?: ContentRedaction | undefined;
  IdentifyLanguage?: boolean | undefined;
  IdentifyMultipleLanguages?: boolean | undefined;
  LanguageOptions?: LanguageCode[] | undefined;
  IdentifiedLanguageScore?: number | undefined;
  LanguageCodes?: LanguageCodeItem[] | undefined;
  Tags?: Tag[] | undefined;
  Subtitles?: SubtitlesOutput | undefined;
  LanguageIdSettings?:
    | Partial<Record<LanguageCode, LanguageIdSettings>>
    | undefined;
  ToxicityDetection?: ToxicityDetectionSettings[] | undefined;
}
export interface GetTranscriptionJobResponse {
  TranscriptionJob?: TranscriptionJob | undefined;
}
export interface GetVocabularyRequest {
  VocabularyName: string | undefined;
}
export interface GetVocabularyResponse {
  VocabularyName?: string | undefined;
  LanguageCode?: LanguageCode | undefined;
  VocabularyState?: VocabularyState | undefined;
  LastModifiedTime?: Date | undefined;
  FailureReason?: string | undefined;
  DownloadUri?: string | undefined;
}
export interface GetVocabularyFilterRequest {
  VocabularyFilterName: string | undefined;
}
export interface GetVocabularyFilterResponse {
  VocabularyFilterName?: string | undefined;
  LanguageCode?: LanguageCode | undefined;
  LastModifiedTime?: Date | undefined;
  DownloadUri?: string | undefined;
}
export interface ListCallAnalyticsCategoriesRequest {
  NextToken?: string | undefined;
  MaxResults?: number | undefined;
}
export interface ListCallAnalyticsCategoriesResponse {
  NextToken?: string | undefined;
  Categories?: CategoryProperties[] | undefined;
}
export interface ListCallAnalyticsJobsRequest {
  Status?: CallAnalyticsJobStatus | undefined;
  JobNameContains?: string | undefined;
  NextToken?: string | undefined;
  MaxResults?: number | undefined;
}
export interface ListCallAnalyticsJobsResponse {
  Status?: CallAnalyticsJobStatus | undefined;
  NextToken?: string | undefined;
  CallAnalyticsJobSummaries?: CallAnalyticsJobSummary[] | undefined;
}
export interface ListLanguageModelsRequest {
  StatusEquals?: ModelStatus | undefined;
  NameContains?: string | undefined;
  NextToken?: string | undefined;
  MaxResults?: number | undefined;
}
export interface ListLanguageModelsResponse {
  NextToken?: string | undefined;
  Models?: LanguageModel[] | undefined;
}
export interface ListMedicalScribeJobsRequest {
  Status?: MedicalScribeJobStatus | undefined;
  JobNameContains?: string | undefined;
  NextToken?: string | undefined;
  MaxResults?: number | undefined;
}
export interface MedicalScribeJobSummary {
  MedicalScribeJobName?: string | undefined;
  CreationTime?: Date | undefined;
  StartTime?: Date | undefined;
  CompletionTime?: Date | undefined;
  LanguageCode?: MedicalScribeLanguageCode | undefined;
  MedicalScribeJobStatus?: MedicalScribeJobStatus | undefined;
  FailureReason?: string | undefined;
}
export interface ListMedicalScribeJobsResponse {
  Status?: MedicalScribeJobStatus | undefined;
  NextToken?: string | undefined;
  MedicalScribeJobSummaries?: MedicalScribeJobSummary[] | undefined;
}
export interface ListMedicalTranscriptionJobsRequest {
  Status?: TranscriptionJobStatus | undefined;
  JobNameContains?: string | undefined;
  NextToken?: string | undefined;
  MaxResults?: number | undefined;
}
export interface MedicalTranscriptionJobSummary {
  MedicalTranscriptionJobName?: string | undefined;
  CreationTime?: Date | undefined;
  StartTime?: Date | undefined;
  CompletionTime?: Date | undefined;
  LanguageCode?: LanguageCode | undefined;
  TranscriptionJobStatus?: TranscriptionJobStatus | undefined;
  FailureReason?: string | undefined;
  OutputLocationType?: OutputLocationType | undefined;
  Specialty?: Specialty | undefined;
  ContentIdentificationType?: MedicalContentIdentificationType | undefined;
  Type?: Type | undefined;
}
export interface ListMedicalTranscriptionJobsResponse {
  Status?: TranscriptionJobStatus | undefined;
  NextToken?: string | undefined;
  MedicalTranscriptionJobSummaries?:
    | MedicalTranscriptionJobSummary[]
    | undefined;
}
export interface ListMedicalVocabulariesRequest {
  NextToken?: string | undefined;
  MaxResults?: number | undefined;
  StateEquals?: VocabularyState | undefined;
  NameContains?: string | undefined;
}
export interface VocabularyInfo {
  VocabularyName?: string | undefined;
  LanguageCode?: LanguageCode | undefined;
  LastModifiedTime?: Date | undefined;
  VocabularyState?: VocabularyState | undefined;
}
export interface ListMedicalVocabulariesResponse {
  Status?: VocabularyState | undefined;
  NextToken?: string | undefined;
  Vocabularies?: VocabularyInfo[] | undefined;
}
export interface ListTagsForResourceRequest {
  ResourceArn: string | undefined;
}
export interface ListTagsForResourceResponse {
  ResourceArn?: string | undefined;
  Tags?: Tag[] | undefined;
}
export interface ListTranscriptionJobsRequest {
  Status?: TranscriptionJobStatus | undefined;
  JobNameContains?: string | undefined;
  NextToken?: string | undefined;
  MaxResults?: number | undefined;
}
export interface TranscriptionJobSummary {
  TranscriptionJobName?: string | undefined;
  CreationTime?: Date | undefined;
  StartTime?: Date | undefined;
  CompletionTime?: Date | undefined;
  LanguageCode?: LanguageCode | undefined;
  TranscriptionJobStatus?: TranscriptionJobStatus | undefined;
  FailureReason?: string | undefined;
  OutputLocationType?: OutputLocationType | undefined;
  ContentRedaction?: ContentRedaction | undefined;
  ModelSettings?: ModelSettings | undefined;
  IdentifyLanguage?: boolean | undefined;
  IdentifyMultipleLanguages?: boolean | undefined;
  IdentifiedLanguageScore?: number | undefined;
  LanguageCodes?: LanguageCodeItem[] | undefined;
  ToxicityDetection?: ToxicityDetectionSettings[] | undefined;
}
export interface ListTranscriptionJobsResponse {
  Status?: TranscriptionJobStatus | undefined;
  NextToken?: string | undefined;
  TranscriptionJobSummaries?: TranscriptionJobSummary[] | undefined;
}
export interface ListVocabulariesRequest {
  NextToken?: string | undefined;
  MaxResults?: number | undefined;
  StateEquals?: VocabularyState | undefined;
  NameContains?: string | undefined;
}
export interface ListVocabulariesResponse {
  Status?: VocabularyState | undefined;
  NextToken?: string | undefined;
  Vocabularies?: VocabularyInfo[] | undefined;
}
export interface ListVocabularyFiltersRequest {
  NextToken?: string | undefined;
  MaxResults?: number | undefined;
  NameContains?: string | undefined;
}
export interface VocabularyFilterInfo {
  VocabularyFilterName?: string | undefined;
  LanguageCode?: LanguageCode | undefined;
  LastModifiedTime?: Date | undefined;
}
export interface ListVocabularyFiltersResponse {
  NextToken?: string | undefined;
  VocabularyFilters?: VocabularyFilterInfo[] | undefined;
}
export interface MedicalScribePatientContext {
  Pronouns?: Pronouns | undefined;
}
export interface MedicalScribeContext {
  PatientContext?: MedicalScribePatientContext | undefined;
}
export interface StartCallAnalyticsJobRequest {
  CallAnalyticsJobName: string | undefined;
  Media: Media | undefined;
  OutputLocation?: string | undefined;
  OutputEncryptionKMSKeyId?: string | undefined;
  DataAccessRoleArn?: string | undefined;
  Settings?: CallAnalyticsJobSettings | undefined;
  Tags?: Tag[] | undefined;
  ChannelDefinitions?: ChannelDefinition[] | undefined;
}
export interface StartCallAnalyticsJobResponse {
  CallAnalyticsJob?: CallAnalyticsJob | undefined;
}
export interface StartMedicalScribeJobRequest {
  MedicalScribeJobName: string | undefined;
  Media: Media | undefined;
  OutputBucketName: string | undefined;
  OutputEncryptionKMSKeyId?: string | undefined;
  KMSEncryptionContext?: Record<string, string> | undefined;
  DataAccessRoleArn: string | undefined;
  Settings: MedicalScribeSettings | undefined;
  ChannelDefinitions?: MedicalScribeChannelDefinition[] | undefined;
  Tags?: Tag[] | undefined;
  MedicalScribeContext?: MedicalScribeContext | undefined;
}
export interface StartMedicalScribeJobResponse {
  MedicalScribeJob?: MedicalScribeJob | undefined;
}
export interface StartMedicalTranscriptionJobRequest {
  MedicalTranscriptionJobName: string | undefined;
  LanguageCode: LanguageCode | undefined;
  MediaSampleRateHertz?: number | undefined;
  MediaFormat?: MediaFormat | undefined;
  Media: Media | undefined;
  OutputBucketName: string | undefined;
  OutputKey?: string | undefined;
  OutputEncryptionKMSKeyId?: string | undefined;
  KMSEncryptionContext?: Record<string, string> | undefined;
  Settings?: MedicalTranscriptionSetting | undefined;
  ContentIdentificationType?: MedicalContentIdentificationType | undefined;
  Specialty: Specialty | undefined;
  Type: Type | undefined;
  Tags?: Tag[] | undefined;
}
export interface StartMedicalTranscriptionJobResponse {
  MedicalTranscriptionJob?: MedicalTranscriptionJob | undefined;
}
export interface Subtitles {
  Formats?: SubtitleFormat[] | undefined;
  OutputStartIndex?: number | undefined;
}
export interface StartTranscriptionJobRequest {
  TranscriptionJobName: string | undefined;
  LanguageCode?: LanguageCode | undefined;
  MediaSampleRateHertz?: number | undefined;
  MediaFormat?: MediaFormat | undefined;
  Media: Media | undefined;
  OutputBucketName?: string | undefined;
  OutputKey?: string | undefined;
  OutputEncryptionKMSKeyId?: string | undefined;
  KMSEncryptionContext?: Record<string, string> | undefined;
  Settings?: Settings | undefined;
  ModelSettings?: ModelSettings | undefined;
  JobExecutionSettings?: JobExecutionSettings | undefined;
  ContentRedaction?: ContentRedaction | undefined;
  IdentifyLanguage?: boolean | undefined;
  IdentifyMultipleLanguages?: boolean | undefined;
  LanguageOptions?: LanguageCode[] | undefined;
  Subtitles?: Subtitles | undefined;
  Tags?: Tag[] | undefined;
  LanguageIdSettings?:
    | Partial<Record<LanguageCode, LanguageIdSettings>>
    | undefined;
  ToxicityDetection?: ToxicityDetectionSettings[] | undefined;
}
export interface StartTranscriptionJobResponse {
  TranscriptionJob?: TranscriptionJob | undefined;
}
export interface TagResourceRequest {
  ResourceArn: string | undefined;
  Tags: Tag[] | undefined;
}
export interface TagResourceResponse {}
export interface UntagResourceRequest {
  ResourceArn: string | undefined;
  TagKeys: string[] | undefined;
}
export interface UntagResourceResponse {}
export interface UpdateCallAnalyticsCategoryRequest {
  CategoryName: string | undefined;
  Rules: Rule[] | undefined;
  InputType?: InputType | undefined;
}
export interface UpdateCallAnalyticsCategoryResponse {
  CategoryProperties?: CategoryProperties | undefined;
}
export interface UpdateMedicalVocabularyRequest {
  VocabularyName: string | undefined;
  LanguageCode: LanguageCode | undefined;
  VocabularyFileUri: string | undefined;
}
export interface UpdateMedicalVocabularyResponse {
  VocabularyName?: string | undefined;
  LanguageCode?: LanguageCode | undefined;
  LastModifiedTime?: Date | undefined;
  VocabularyState?: VocabularyState | undefined;
}
export interface UpdateVocabularyRequest {
  VocabularyName: string | undefined;
  LanguageCode: LanguageCode | undefined;
  Phrases?: string[] | undefined;
  VocabularyFileUri?: string | undefined;
  DataAccessRoleArn?: string | undefined;
}
export interface UpdateVocabularyResponse {
  VocabularyName?: string | undefined;
  LanguageCode?: LanguageCode | undefined;
  LastModifiedTime?: Date | undefined;
  VocabularyState?: VocabularyState | undefined;
}
export interface UpdateVocabularyFilterRequest {
  VocabularyFilterName: string | undefined;
  Words?: string[] | undefined;
  VocabularyFilterFileUri?: string | undefined;
  DataAccessRoleArn?: string | undefined;
}
export interface UpdateVocabularyFilterResponse {
  VocabularyFilterName?: string | undefined;
  LanguageCode?: LanguageCode | undefined;
  LastModifiedTime?: Date | undefined;
}
