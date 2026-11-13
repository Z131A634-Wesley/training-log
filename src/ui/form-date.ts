/**
 * 表单打开时的初始日期，以及这个日期是否由用户指定。
 * 用户指定过的日期（补记、编辑）不再被「自动回到今天」覆盖。
 */
export function initialFormDate(
  editingDate: string | undefined,
  initialDate: string | undefined,
  today: string,
): { date: string; pinned: boolean } {
  return {
    date: editingDate ?? initialDate ?? today,
    pinned: Boolean(editingDate) || (Boolean(initialDate) && initialDate !== today),
  }
}
