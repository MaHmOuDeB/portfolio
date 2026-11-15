// The frame primitives: server-safe parts of the framed look that every page can use.
export { Chip, type ChipProps } from './Chip';
export { Quiet } from './Quiet';
export { SECTION_H2, SectionHead, type SectionHeadProps } from './SectionHead';
export { PageHead, type PageHeadProps } from './PageHead';
export { Vignette } from './Vignette';
export { IntervalMark, MiniRow, Tag, Tick } from './marks';
export { Faq, type FaqItem, type FaqProps } from './Faq';
export { CallToAction, type CallToActionProps } from './CallToAction';
// The reading model of the inner pages: key points, the sentences around an exhibit, the method row,
// the figure sheet, the in-page links, the page's close, the previous and next row, and the section h2.
export { KeyPoints, type KeyPoint, type KeyPointsProps } from './KeyPoints';
export { LeadIn, Takeaway } from './Exhibit';
export { MethodDetails, type MethodDetailsProps } from './MethodDetails';
export { FigureSheet, type FigureSheetProps } from './FigureSheet';
export { SectionNav, type SectionNavItem, type SectionNavProps } from './SectionNav';
export { PageClose, type PageCloseLink, type PageCloseProps } from './PageClose';
export { NextRow, type NextRowLink, type NextRowProps } from './NextRow';
