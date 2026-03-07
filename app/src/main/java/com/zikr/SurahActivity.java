package com.zikr;

import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.TextView;
import android.widget.Toast;
import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.recyclerview.widget.GridLayoutManager;
import androidx.recyclerview.widget.RecyclerView;
import com.google.firebase.database.DataSnapshot;
import com.google.firebase.database.DatabaseError;
import com.google.firebase.database.DatabaseReference;
import com.google.firebase.database.FirebaseDatabase;
import com.google.firebase.database.ValueEventListener;
import java.util.ArrayList;
import java.util.List;

public class SurahActivity extends AppCompatActivity {

    private RecyclerView rvFolders;
    private View folderContainer;
    private View fragmentContainer;
    private DatabaseReference dbRef;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_surah);

        folderContainer = findViewById(R.id.folderContainer);
        fragmentContainer = findViewById(R.id.surahFragmentContainer);
        rvFolders = findViewById(R.id.rvFolders);
        
        // 2 Folders ek line mein
        rvFolders.setLayoutManager(new GridLayoutManager(this, 2));

        // Firebase Connection
        dbRef = FirebaseDatabase.getInstance().getReference("surah_data");
        fetchFolders();
    }

    private void fetchFolders() {
        dbRef.addValueEventListener(new ValueEventListener() {
            @Override
            public void onDataChange(@NonNull DataSnapshot snapshot) {
                List<String> folderKeys = new ArrayList<>();
                List<String> folderNames = new ArrayList<>();

                for (DataSnapshot folderSnap : snapshot.getChildren()) {
                    folderKeys.add(folderSnap.getKey());
                    // Firebase structure mein folderName string save karenge
                    folderNames.add(folderSnap.child("folderName").getValue(String.class));
                }

                rvFolders.setAdapter(new FolderAdapter(folderKeys, folderNames));
            }

            @Override
            public void onCancelled(@NonNull DatabaseError error) {
                Toast.makeText(SurahActivity.this, "Failed to load folders", Toast.LENGTH_SHORT).show();
            }
        });
    }

    // --- INLINE ADAPTER FOR FOLDERS ---
    class FolderAdapter extends RecyclerView.Adapter<FolderAdapter.ViewHolder> {
        List<String> keys, names;
        FolderAdapter(List<String> keys, List<String> names) {
            this.keys = keys; this.names = names;
        }

        @NonNull @Override
        public ViewHolder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
            View v = LayoutInflater.from(parent.getContext()).inflate(R.layout.item_folder, parent, false);
            return new ViewHolder(v);
        }

        @Override
        public void onBindViewHolder(@NonNull ViewHolder holder, int position) {
            String folderName = names.get(position);
            String folderKey = keys.get(position);
            holder.tvFolderName.setText(folderName != null ? folderName : "Unknown");

            // Click karne par Fragment open karna
            holder.itemView.setOnClickListener(v -> {
                folderContainer.setVisibility(View.GONE);
                fragmentContainer.setVisibility(View.VISIBLE);

                SurahListFragment fragment = new SurahListFragment();
                Bundle args = new Bundle();
                args.putString("FOLDER_KEY", folderKey);
                args.putString("FOLDER_NAME", folderName);
                fragment.setArguments(args);

                getSupportFragmentManager().beginTransaction()
                        .replace(R.id.surahFragmentContainer, fragment)
                        .commit();
            });
        }

        @Override public int getItemCount() { return names.size(); }

        class ViewHolder extends RecyclerView.ViewHolder {
            TextView tvFolderName;
            ViewHolder(View v) { super(v); tvFolderName = v.findViewById(R.id.tvFolderName); }
        }
    }

    // Fragment se wapas aane ke liye public method
    public void closeFragmentAndShowFolders() {
        fragmentContainer.setVisibility(View.GONE);
        folderContainer.setVisibility(View.VISIBLE);
    }
    
    @Override
    public void onBackPressed() {
        if (fragmentContainer.getVisibility() == View.VISIBLE) {
            closeFragmentAndShowFolders();
        } else {
            super.onBackPressed();
        }
    }
}
