import { makeStyles } from '@material-ui/core';

const useStyles = makeStyles(theme => ({
  root: {
    height: 1,
    width: '100%',
    background: theme.palette.divider,
    border: 'none',
    margin: theme.spacing(1.2, 0),
  },
}));

/**
 * The sidebar divider in the theme's divider colour. core-components'
 * SidebarDivider hard-codes #383838 (harsh on the light sidebar) and, being
 * a styled() component, loses its styles entirely under a theme override.
 */
export const Divider = () => <hr className={useStyles().root} />;
