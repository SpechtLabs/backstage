import { makeStyles } from '@material-ui/core';
import { LogoIcon } from './LogoIcon';

const useStyles = makeStyles(theme => ({
  root: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  wordmark: {
    display: 'flex',
    flexDirection: 'column',
    lineHeight: 1.1,
  },
  name: {
    fontSize: 17,
    fontWeight: 700,
    letterSpacing: '-0.02em',
    color: theme.palette.text.primary,
  },
  product: {
    fontSize: 11,
    fontWeight: 500,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    color: theme.palette.text.secondary,
  },
}));

/** The tile and the SpechtLabs wordmark, for the open sidebar. */
export const LogoFull = () => {
  const classes = useStyles();
  return (
    <div className={classes.root}>
      <LogoIcon />
      <div className={classes.wordmark}>
        <span className={classes.name}>SpechtLabs</span>
        <span className={classes.product}>Backstage</span>
      </div>
    </div>
  );
};
