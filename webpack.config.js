module.exports = {
  resolve: {
    extensions: [".js", ".jsx", ".ts", ".tsx"],
  },
  module: {
    rules: [
      {
        test: /\.(js|jsx|ts|tsx)$/,
        exclude: /node_modules\/@mediapipe\/tasks-vision/,
        use: {
          loader: "babel-loader",
        },
      },
      {
        test: /\.(jpg|jpeg|png|webp|svg)$/,
        type: "asset/resource",
      },
    ],
  },
  ignoreWarnings: [/Failed to parse source map/],
  devServer: {
    hot: false,
  }
};
