import { makeStyles } from '@material-ui/core';
import spechtIcon from './specht-icon.svg';

const useStyles = makeStyles({
  img: {
    display: 'block',
    width: 32,
    height: 32,
  },
});

/** The SpechtLabs woodpecker tile (the logo of the SpechtLabs docs sites). */
export const LogoIcon = () => {
  const classes = useStyles();
  return <img className={classes.img} src={spechtIcon} alt="SpechtLabs" />;
};
