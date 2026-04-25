let ioInstance = null;

const setSocketServer = (io) => {
    ioInstance = io;
};

const getSocketServer = () => ioInstance;

module.exports = {
    setSocketServer,
    getSocketServer
};
