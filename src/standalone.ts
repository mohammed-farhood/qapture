// Standalone entry for non-React hosts: exposes the imperative mount so a plain
// <script> / web-component wrapper can boot QA Studio without a React peer in the
// host app. (Phase 1 wires the custom-element registration here.)
export { initQaStudio } from './index';
export type { QaConfig } from './index';
