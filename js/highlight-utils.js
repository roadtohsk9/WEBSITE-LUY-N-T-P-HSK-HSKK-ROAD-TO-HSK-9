/**
 * Shared Highlight & Note Utilities
 * Áp dụng cho: exam-reading, exam-listening, practice-test
 * và bất kỳ page nào cần highlight/note functionality
 */

const HIGHLIGHT_COLORS = {
  brown: { bg: '#352315', text: '#FFFFFF' },
  pink: { bg: '#FF007F', text: '#FFFFFF' }
};

/**
 * Tạo span/mark element với inline styles
 * @param {string} tag - 'span' hoặc 'mark'
 * @param {string} cls - class name ('hl-brown' hoặc 'hl-pink')
 * @param {string} text - content text
 * @returns {Element}
 */
function createHighlightElement(tag = 'mark', cls = 'hl-brown', text = '') {
  const el = document.createElement(tag);
  el.className = cls;
  el.textContent = text;
  
  // Inline styles - guaranteed to apply
  const color = cls === 'hl-pink' ? HIGHLIGHT_COLORS.pink : HIGHLIGHT_COLORS.brown;
  el.style.backgroundColor = color.bg;
  el.style.color = color.text;
  el.style.display = 'inline';
  el.style.padding = '2px 4px';
  el.style.borderRadius = '2px';
  
  return el;
}

/**
 * Wrap selection range với highlight element
 * @param {Range} range - text range
 * @param {string} colorClass - 'hl-brown' hoặc 'hl-pink'
 * @param {string} tag - 'span' hoặc 'mark' (default: span for reading, mark for listening)
 */
function wrapHighlight(range, colorClass = 'hl-brown', tag = 'span') {
  if (!range || range.collapsed) return null;
  
  const wrapper = createHighlightElement(tag, colorClass);
  
  try {
    range.surroundContents(wrapper);
  } catch (error) {
    // Fallback: extract contents and re-wrap
    const fragment = range.extractContents();
    wrapper.appendChild(fragment);
    range.insertNode(wrapper);
  }
  
  return wrapper;
}

/**
 * Wrap selected range (for listening-like complex DOM)
 * @param {Range} range - text range
 * @param {string} cls - class name
 * @param {Element} root - root element to traverse
 * @param {string} tag - 'span' hoặc 'mark'
 */
function wrapSelectedRange(range, cls, root, tag = 'mark') {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  let node;
  
  while (node = walker.nextNode()) {
    if (!node.nodeValue) continue;
    try {
      if (range.intersectsNode(node)) nodes.push(node);
    } catch {}
  }
  
  nodes.forEach(node => {
    const start = node === range.startContainer ? range.startOffset : 0;
    const end = node === range.endContainer ? range.endOffset : node.nodeValue.length;
    
    if (end <= start) return;
    
    const before = node.nodeValue.slice(0, start);
    const selected = node.nodeValue.slice(start, end);
    const after = node.nodeValue.slice(end);
    
    const frag = document.createDocumentFragment();
    
    if (before) frag.appendChild(document.createTextNode(before));
    
    const mark = createHighlightElement(tag, cls, selected);
    frag.appendChild(mark);
    
    if (after) frag.appendChild(document.createTextNode(after));
    
    node.parentNode.replaceChild(frag, node);
  });
}

/**
 * Toggle highlight color
 * @param {Element} element - highlight element
 * @param {string} currentClass - current class
 * @returns {string} new class
 */
function toggleHighlightColor(element, currentClass = 'hl-brown') {
  if (currentClass === 'hl-brown') {
    element.classList.remove('hl-brown');
    element.classList.add('hl-pink');
    element.style.backgroundColor = HIGHLIGHT_COLORS.pink.bg;
    element.style.color = HIGHLIGHT_COLORS.pink.text;
    return 'hl-pink';
  } else {
    element.classList.remove('hl-pink');
    element.classList.add('hl-brown');
    element.style.backgroundColor = HIGHLIGHT_COLORS.brown.bg;
    element.style.color = HIGHLIGHT_COLORS.brown.text;
    return 'hl-brown';
  }
}

/**
 * Remove highlight element (unwrap)
 * @param {Element} element - highlight element to remove
 */
function removeHighlight(element) {
  if (!element || !element.parentNode) return;
  
  const parent = element.parentNode;
  while (element.firstChild) {
    parent.insertBefore(element.firstChild, element);
  }
  parent.removeChild(element);
}

/**
 * Find closest highlight element
 * @param {Node} node - starting node
 * @returns {Element|null}
 */
function findHighlightElement(node) {
  if (node.nodeType === 1) return node.closest?.('span.hl-brown, span.hl-pink, mark.hl-brown, mark.hl-pink');
  return node.parentElement?.closest?.('span.hl-brown, span.hl-pink, mark.hl-brown, mark.hl-pink');
}

/**
 * Get highlight from range
 * @param {Range} range
 * @returns {Element|null}
 */
function getHighlightFromRange(range) {
  const ancestor = range.commonAncestorContainer.nodeType === 1 
    ? range.commonAncestorContainer 
    : range.commonAncestorContainer.parentElement;
  
  return ancestor?.closest?.('span.hl-brown, span.hl-pink, mark.hl-brown, mark.hl-pink');
}

/**
 * Setup highlight/note UI for any page
 * Assumes HTML has:
 * - #selectionMenu (with #highlightBtn, #noteBtn)
 * - #notesPanel (with #noteInput, #saveNote, #closeNotes)
 * 
 * @param {Function} onHighlight - callback when highlight button clicked
 * @param {Function} onNote - callback when note button clicked
 */
function setupHighlightUI(onHighlight, onNote) {
  const menu = document.getElementById('selectionMenu');
  const notesPanel = document.getElementById('notesPanel');
  
  if (!menu || !notesPanel) {
    console.warn('Highlight UI elements not found in DOM');
    return;
  }
  
  const highlightBtn = document.getElementById('highlightBtn');
  const noteBtn = document.getElementById('noteBtn');
  const closeNotes = document.getElementById('closeNotes');
  const saveNote = document.getElementById('saveNote');
  
  if (highlightBtn) {
    highlightBtn.onclick = onHighlight;
  }
  
  if (noteBtn) {
    noteBtn.onclick = onNote;
  }
  
  if (closeNotes) {
    closeNotes.onclick = () => notesPanel.classList.remove('open');
  }
  
  if (saveNote) {
    saveNote.onclick = () => notesPanel.classList.remove('open');
  }
  
  // Close menu when clicking outside
  document.addEventListener('mousedown', e => {
    if (!e.target.closest('#selectionMenu')) {
      menu.classList.remove('show');
    }
  });
}

/**
 * Show selection menu at position
 * @param {Element} menu - selection menu element
 * @param {DOMRect} rect - bounding rect of selection
 */
function showSelectionMenu(menu, rect) {
  if (!menu) return;
  
  menu.classList.add('show');
  menu.style.left = rect.left + window.scrollX + 'px';
  menu.style.top = (rect.bottom + window.scrollY + 5) + 'px';
}
