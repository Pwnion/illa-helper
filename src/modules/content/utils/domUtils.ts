import { isProcessingResultNode as isProcessingPipelineNode } from '../../processing/DomTranslationPolicy';

/**
 * Whether the node is a processing result (translation, pronunciation and similar elements)
 */
export function isProcessingResultNode(node: Node): boolean {
  return isProcessingPipelineNode(node);
}

/**
 * Whether a node is a descendant of any other node in the set
 */
export function isDescendant(node: Node, nodeSet: Set<Node>): boolean {
  let parent = node.parentElement;
  while (parent) {
    if (nodeSet.has(parent)) return true;
    parent = parent.parentElement;
  }
  return false;
}
