import type { Config } from 'dompurify';
import DOMPurify from 'dompurify';

const purifier = DOMPurify();
const { isValidAttribute } = purifier;
const sanitize = (dirty: string | Node, config?: Config): string => purifier.sanitize(dirty, config);

export { Config, isValidAttribute };

export default sanitize;
