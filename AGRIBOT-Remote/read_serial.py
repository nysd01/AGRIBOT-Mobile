#!/usr/bin/env python3
import serial
import sys
import time

try:
    print("Attempting to open COM4...")
    ser = serial.Serial('COM4', 115200, timeout=2)
    print('✓ Connected to COM4 at 115200 baud')
    print('Reading serial data...')
    print('=' * 70)
    
    start_time = time.time()
    lines_read = 0
    last_output_time = time.time()
    
    while True:
        # Check for timeout after 30 seconds OR if no data for 10 seconds
        elapsed = time.time() - start_time
        idle_time = time.time() - last_output_time
        
        if elapsed > 30 or idle_time > 10:
            break
            
        if ser.in_waiting:
            data = ser.read(ser.in_waiting)
            output = data.decode('utf-8', errors='ignore')
            print(output, end='', flush=True)
            lines_read += len(output.split('\n'))
            last_output_time = time.time()
        
        time.sleep(0.05)
    
    ser.close()
    print('\n' + '=' * 70)
    print(f'✓ Serial read complete - {lines_read} lines collected')
    
except Exception as e:
    print(f'✗ Error: {type(e).__name__}: {e}')
    sys.exit(1)
