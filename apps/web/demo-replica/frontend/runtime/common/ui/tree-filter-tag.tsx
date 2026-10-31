import Tag from '@arco-design/web-react/es/Tag';
import type { TreeSelectProps } from '@arco-design/web-react/es/TreeSelect';
/** Arco still creates an overflow item when maxTagCount.render returns null.
 * Omit that item, not the search input or selected tags. Preserve native close
 * semantics and focus handling; normal nonempty tags retain their original UI. */
export const renderTreeFilterTag: NonNullable<TreeSelectProps['renderTag']> = ({label,closable,onClose}) => {
 if(label === null && !closable)return null;
 return <Tag visible closable={closable} onClose={onClose} className="arco-input-tag-tag arco-tree-select-tag"
  title={typeof label==='string'?label:undefined} __closeIconProps={{onMouseDown:event=>event.preventDefault()}}>{label}</Tag>;
};
