import alignCenterIcon from '../../assets/icons/align_center/2.png';
import alignLeftIcon from '../../assets/icons/align_left/2.png';
import alignRightIcon from '../../assets/icons/align_right/2.png';

const icons = [
    {
        type: 'size',
        tooltip: 'Table Size',
        label: 'size',
    },
    {
        type: 'none',
        tooltip: 'Default Alignment',
        label: 'Default',
    },
    {
        type: 'left',
        tooltip: 'Align Left',
        icon: alignLeftIcon,
    },
    {
        type: 'center',
        tooltip: 'Align Center',
        icon: alignCenterIcon,
    },
    {
        type: 'right',
        tooltip: 'Align Right',
        icon: alignRightIcon,
    },
] as const;

export type TableColumnToolIcon = typeof icons[number];

export default icons;
