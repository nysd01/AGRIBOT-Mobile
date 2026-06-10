const React = require('react');
const { View } = require('react-native');

const Noop = () => null;
const MapView = (props) => React.createElement(View, props);
MapView.Animated = MapView;

module.exports = {
  default: MapView,
  MapView,
  Marker: Noop,
  Polyline: Noop,
  PROVIDER_GOOGLE: 'google',
};
