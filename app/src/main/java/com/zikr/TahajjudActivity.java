package com.zikr;

import android.os.Bundle;
import androidx.appcompat.app.AppCompatActivity;
import com.zikr.databinding.ActivityTahajjudBinding;

public class TahajjudActivity extends AppCompatActivity {

    private ActivityTahajjudBinding binding;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        // Setup ViewBinding
        binding = ActivityTahajjudBinding.inflate(getLayoutInflater());
        setContentView(binding.getRoot());
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        binding = null; // Memory leak se bachne ke liye
    }
}
