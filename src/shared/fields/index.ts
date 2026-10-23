// مكوّن الإدراج الآمن في حقول التحرير وتبديل اتجاهها (T-2.4)؛ تعيد استعماله الوحدة (و).
export { FIELD_DIRECTIONS, fieldDirection, insertIntoField, nextDirection, restoreField, setFieldDirection, snapshotField } from './field';
export type { FieldDirection, FieldSnapshot, InsertResult, TextField } from './field';
