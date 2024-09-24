package stdio

import (
	"io"
	"net"

	"github.com/loft-sh/log"
)

// NewStdioListener creates a new stdio listener
func NewStdioListener(reader io.Reader, writer io.WriteCloser, exitOnClose bool, label string, log log.Logger, done chan<- struct{}) *StdioListener {
	conn := NewStdioStream(reader, writer, exitOnClose, 0, label, log, done)
	connChan := make(chan net.Conn)
	go func() {
		connChan <- conn
	}()

	if log != nil {
		log.Info("[START] StdIO Listener: ", label)
	}

	return &StdioListener{
		connChan: connChan,
		log:      log,
		label:    label,
	}
}

// StdioListener implements the net.Listener interface
type StdioListener struct {
	connChan chan net.Conn

	log   log.Logger
	label string
}

// Ready implements interface net.Listener
func (lis *StdioListener) Ready(conn net.Conn) {

}

// Accept implements interface net.Listener
func (lis *StdioListener) Accept() (net.Conn, error) {
	if lis.log != nil {
		lis.log.Info("Accepting connection: ", lis.label)
	}

	return <-lis.connChan, nil
}

// Close implements interface net.Listener
func (lis *StdioListener) Close() error {
	if lis.log != nil {
		lis.log.Info("[CLOSE] listener: ", lis.label)
	}
	return nil
}

// Addr implements interface
func (lis *StdioListener) Addr() net.Addr {
	return NewStdinAddr("listener")
}
